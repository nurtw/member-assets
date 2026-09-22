import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { loadEnvironment } from '../../config/environment.js';

/**
 * Thin wrapper over Paystack's REST API (PRD §27).
 *
 * PRD Requirement 27.10 — the secret key is read from the environment on
 * each call (never cached into a constant that could be logged or dumped)
 * and never appears in a log line, an error message, or a URL. Every method
 * here throws rather than silently returning an unauthenticated response
 * when the key is absent, because a misconfigured deployment must fail
 * loudly rather than accept payments it cannot actually verify.
 */
@Injectable()
export class PaystackClient {
  private readonly logger = new Logger(PaystackClient.name);

  private secretKey(): string {
    const key = loadEnvironment().paystackSecretKey;
    if (!key) {
      throw new Error(
        'PAYSTACK_SECRET_KEY is not configured. Payments cannot proceed.',
      );
    }
    return key;
  }

  private baseUrl(): string {
    return loadEnvironment().paystackBaseUrl;
  }

  private async request<T>(
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl()}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${this.secretKey()}`,
        'Content-Type': 'application/json',
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });

    const payload = (await response.json()) as {
      status: boolean;
      message: string;
      data: T;
    };

    if (!response.ok || !payload.status) {
      // Paystack's own message only; never echo the request body, which may
      // carry a bank account number.
      this.logger.warn(`Paystack ${path} failed: ${payload.message}`);
      throw new Error(`Paystack request failed: ${payload.message}`);
    }

    return payload.data;
  }

  /** Initialise a payment-link transaction. Amount is in kobo. */
  async initializeTransaction(input: {
    email: string;
    amountKobo: number;
    reference: string;
    subaccountCode?: string;
    transactionChargeKobo?: number;
    callbackUrl?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ authorizationUrl: string; accessCode: string; reference: string }> {
    const data = await this.request<{
      authorization_url: string;
      access_code: string;
      reference: string;
    }>('/transaction/initialize', {
      method: 'POST',
      body: {
        email: input.email,
        amount: input.amountKobo,
        reference: input.reference,
        subaccount: input.subaccountCode,
        transaction_charge: input.transactionChargeKobo,
        // The contractor's own account bears Paystack's fee, never the
        // subaccount — Requirement 27.4.
        bearer: input.subaccountCode ? 'account' : undefined,
        callback_url: input.callbackUrl,
        metadata: input.metadata,
      },
    });

    return {
      authorizationUrl: data.authorization_url,
      accessCode: data.access_code,
      reference: data.reference,
    };
  }

  /** Server-side verification (Requirement 27.5) — never trust the webhook alone. */
  async verifyTransaction(reference: string): Promise<{
    status: 'success' | 'failed' | 'abandoned' | string;
    amountKobo: number;
    currency: string;
    reference: string;
    feesKobo: number | null;
  }> {
    const data = await this.request<{
      status: string;
      amount: number;
      currency: string;
      reference: string;
      fees: number | null;
    }>(`/transaction/verify/${encodeURIComponent(reference)}`);

    return {
      status: data.status,
      amountKobo: data.amount,
      currency: data.currency,
      reference: data.reference,
      feesKobo: data.fees,
    };
  }

  async createSubaccount(input: {
    businessName: string;
    bankCode: string;
    accountNumber: string;
    percentageCharge: number;
  }): Promise<{ subaccountCode: string }> {
    const data = await this.request<{ subaccount_code: string }>(
      '/subaccount',
      {
        method: 'POST',
        body: {
          business_name: input.businessName,
          bank_code: input.bankCode,
          account_number: input.accountNumber,
          percentage_charge: input.percentageCharge,
        },
      },
    );
    return { subaccountCode: data.subaccount_code };
  }

  /**
   * Updates the EXISTING subaccount's bank details in place (Requirement
   * 27.12). Never call `createSubaccount` again for an account change —
   * that would mint a second subaccount and strand every dedicated account
   * and payment link already settling to the first one.
   */
  async updateSubaccount(
    subaccountCode: string,
    input: { businessName: string; bankCode: string; accountNumber: string },
  ): Promise<void> {
    await this.request(`/subaccount/${encodeURIComponent(subaccountCode)}`, {
      method: 'PUT',
      body: {
        business_name: input.businessName,
        description: input.businessName,
        bank_code: input.bankCode,
        account_number: input.accountNumber,
      },
    });
  }

  /** Resolves an account number to the name Paystack has on file for it. */
  async resolveAccountNumber(
    accountNumber: string,
    bankCode: string,
  ): Promise<{ accountName: string }> {
    const data = await this.request<{ account_name: string }>(
      `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
    );
    return { accountName: data.account_name };
  }

  async refund(input: {
    reference: string;
    amountKobo?: number;
  }): Promise<void> {
    await this.request('/refund', {
      method: 'POST',
      body: {
        transaction: input.reference,
        amount: input.amountKobo,
      },
    });
  }

  /**
   * Verifies Paystack's `x-paystack-signature` header against the RAW
   * request body (Requirement 27.5). Must run before any database access —
   * an invalid signature is a forgery attempt, not a lookup miss, following
   * the same rule CLAUDE.md states for QR payloads.
   */
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    if (!signatureHeader) {
      return false;
    }
    const expected = createHmac('sha512', this.secretKey())
      .update(rawBody)
      .digest('hex');

    const expectedBuffer = Buffer.from(expected, 'utf8');
    const receivedBuffer = Buffer.from(signatureHeader, 'utf8');
    if (expectedBuffer.length !== receivedBuffer.length) {
      return false;
    }
    return timingSafeEqual(expectedBuffer, receivedBuffer);
  }
}
