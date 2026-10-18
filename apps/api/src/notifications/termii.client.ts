import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { loadEnvironment } from '../config/environment.js';

/** How long one send may take before it counts as the provider being unavailable. */
const SEND_TIMEOUT_MS = 15_000;

/** The provider could not be reached, or answered that it is busy: try again later. */
export class SmsProviderUnavailableError extends Error {
  override readonly name = 'SmsProviderUnavailableError';
}

/** The provider refused this message: trying again would be refused too. */
export class SmsRefusedError extends Error {
  override readonly name = 'SmsRefusedError';
}

/**
 * Termii, the SMS provider (item 45, `QUESTIONS.md` GOV-22): the only code
 * that knows it, as only `PaystackClient` knows Paystack.
 *
 * The API key, the secret key, and the account's base URL come from the
 * environment. None of them, nor the number a message goes to, reaches a log,
 * an error, or a response: errors carry the HTTP status at most.
 */
@Injectable()
export class TermiiClient {
  /** Which parts of the configuration are present; never their values. */
  configuration(): {
    apiKey: boolean;
    baseUrl: boolean;
    webhookSecret: boolean;
  } {
    const environment = loadEnvironment();
    return {
      apiKey: Boolean(environment.termiiApiKey),
      baseUrl: Boolean(environment.termiiBaseUrl),
      webhookSecret: Boolean(environment.termiiSecretKey),
    };
  }

  /** Whether a message can be sent at all. */
  canSend(): boolean {
    const { apiKey, baseUrl } = this.configuration();
    return apiKey && baseUrl;
  }

  /**
   * Sends one plain SMS. `to` is the international form without `+`
   * (`2348031234567`); `from` is the registered sender name; `channel` is
   * `dnd` (transactional, reaches numbers on the do-not-disturb list once
   * Termii has enabled it) or `generic`. Returns Termii's message id, which
   * its delivery reports carry.
   */
  async send(input: {
    to: string;
    text: string;
    from: string;
    channel: 'dnd' | 'generic';
  }): Promise<{ messageId: string }> {
    const { termiiApiKey, termiiBaseUrl } = loadEnvironment();
    if (!termiiApiKey || !termiiBaseUrl) {
      throw new SmsProviderUnavailableError(
        'The SMS provider is not configured.',
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${termiiBaseUrl}/api/sms/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: termiiApiKey,
          to: input.to,
          from: input.from,
          sms: input.text,
          type: 'plain',
          channel: input.channel,
        }),
        signal: controller.signal,
      });
    } catch {
      throw new SmsProviderUnavailableError(
        'The SMS provider could not be reached.',
      );
    } finally {
      clearTimeout(timer);
    }

    const body = (await response.json().catch(() => ({}))) as {
      code?: string;
      message_id?: string | number;
      message_id_str?: string;
    };
    if (response.status >= 500 || response.status === 429) {
      throw new SmsProviderUnavailableError(
        `The SMS provider answered ${response.status}.`,
      );
    }
    const messageId =
      body.message_id_str ??
      (body.message_id !== undefined ? String(body.message_id) : '');
    if (!response.ok || !messageId) {
      throw new SmsRefusedError(
        `The SMS provider refused the message (${response.status}).`,
      );
    }
    return { messageId };
  }

  /**
   * A delivery report's signature (`X-Termii-Signature`): HMAC-SHA512 of the
   * raw body under the secret key. Termii does not say whether the digest is
   * hex or base64, so either is accepted. Without the secret key, every
   * report is refused.
   */
  verifyDeliverySignature(
    rawBody: Buffer,
    signature: string | undefined,
  ): boolean {
    const { termiiSecretKey } = loadEnvironment();
    if (!termiiSecretKey || !signature) {
      return false;
    }
    const digest = createHmac('sha512', termiiSecretKey)
      .update(rawBody)
      .digest();
    const given = signature.trim();
    return [digest.toString('hex'), digest.toString('base64')].some(
      (expected) => {
        const a = Buffer.from(expected, 'utf8');
        const b = Buffer.from(
          expected.length === 128 ? given.toLowerCase() : given,
          'utf8',
        );
        return a.length === b.length && timingSafeEqual(a, b);
      },
    );
  }
}
