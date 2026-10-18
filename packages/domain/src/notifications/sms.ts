/**
 * Text messages to members (PRD Requirement 27.14, revision 1.18;
 * `QUESTIONS.md` PAY-22, GOV-22; roadmap item 45).
 *
 * "No message, not paid": each payment is confirmed to the member by SMS. The
 * rules here are pure, so the API and the settings screen apply one version of
 * them: where a message may go, what a template may say, how it is measured,
 * and what a delivery report means.
 */

import { tryNormalizeNigerianPhone } from '../contact/phone-number.js';

/**
 * The only values a template can put into a message. A template is otherwise
 * literal text, so no message can carry a NIN, an address, a whole telephone
 * number, a next of kin, a guarantor, or a chassis number: there is no
 * placeholder for any of them.
 */
export const SMS_PLACEHOLDERS = ['amount', 'member', 'date', 'owed'] as const;
export type SmsPlaceholder = (typeof SMS_PLACEHOLDERS)[number];
export type SmsValues = Record<SmsPlaceholder, string>;

/** The messages the System sends, by key. Their words are the Union's. */
export const SMS_TEMPLATE_KEYS = [
  'payment_received',
  'payment_received_clear',
] as const;
export type SmsTemplateKey = (typeof SMS_TEMPLATE_KEYS)[number];

/**
 * The words a database starts with, until an officer changes them on the
 * settings screen. English first (GOV-22); another language only in words the
 * Union writes.
 */
export const SMS_TEMPLATE_DEFAULTS: Record<
  SmsTemplateKey,
  { label: string; body: string }
> = {
  payment_received: {
    label: 'Payment received, more still to pay',
    body: 'NURTW: {amount} received for member {member} on {date}. Still to pay now: {owed}.',
  },
  payment_received_clear: {
    label: 'Payment received, nothing more due',
    body: 'NURTW: {amount} received for member {member} on {date}. Nothing more is due now.',
  },
};

/**
 * The longest values a placeholder can plausibly take, used to check that a
 * template still fits once it is filled in.
 */
export const SMS_LONGEST_VALUES: SmsValues = {
  amount: 'N9,999,999.99',
  member: 'NURTW-ABCDEFGHIJ',
  date: '30 Sep',
  owed: 'N9,999,999.99',
};

/** What a filled-in message may cost at most: two SMS. */
export const SMS_MAX_PARTS = 2;

// GSM 03.38: the basic set counts one each, the extension set two each.
// Anything else forces UCS-2, which more than halves what one SMS holds.
const GSM_BASIC = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
);
const GSM_EXTENDED = new Set('^{}\\[~]|€');

/** Characters outside the SMS alphabet, each once, in order of appearance. */
export function nonSmsCharacters(text: string): string[] {
  const found: string[] = [];
  for (const character of text) {
    if (
      !GSM_BASIC.has(character) &&
      !GSM_EXTENDED.has(character) &&
      !found.includes(character)
    ) {
      found.push(character);
    }
  }
  return found;
}

/** How many SMS a message in the SMS alphabet takes: 160, then 153 a part. */
export function smsParts(text: string): number {
  let units = 0;
  for (const character of text) {
    units += GSM_EXTENDED.has(character) ? 2 : 1;
  }
  if (units <= 160) {
    return 1;
  }
  return Math.ceil(units / 153);
}

export type SmsTemplateIssue =
  | { kind: 'EMPTY' }
  | { kind: 'UNKNOWN_PLACEHOLDER'; name: string }
  | { kind: 'NOT_SMS_ALPHABET'; characters: string[] }
  | { kind: 'TOO_LONG'; parts: number };

const PLACEHOLDER = /\{([^{}]*)\}/g;

/** Why a template cannot be used; empty when it can. */
export function checkSmsTemplate(body: string): SmsTemplateIssue[] {
  if (body.trim().length === 0) {
    return [{ kind: 'EMPTY' }];
  }
  const issues: SmsTemplateIssue[] = [];
  for (const [, name] of body.matchAll(PLACEHOLDER)) {
    if (!(SMS_PLACEHOLDERS as readonly string[]).includes(name!)) {
      issues.push({ kind: 'UNKNOWN_PLACEHOLDER', name: name! });
    }
  }
  const literal = body.replace(PLACEHOLDER, '');
  const outside = nonSmsCharacters(literal);
  if (outside.length > 0) {
    issues.push({ kind: 'NOT_SMS_ALPHABET', characters: outside });
  }
  const parts = smsParts(renderSmsTemplate(body, SMS_LONGEST_VALUES));
  if (parts > SMS_MAX_PARTS) {
    issues.push({ kind: 'TOO_LONG', parts });
  }
  return issues;
}

/** Fills a template. An unknown placeholder is left as written. */
export function renderSmsTemplate(body: string, values: SmsValues): string {
  return body.replace(PLACEHOLDER, (whole, name: string) =>
    (SMS_PLACEHOLDERS as readonly string[]).includes(name)
      ? values[name as SmsPlaceholder]
      : whole,
  );
}

/**
 * Naira as an SMS writes it: `N2,000`, or `N2,000.50`. The naira sign is
 * outside the SMS alphabet and would turn every message into the costlier
 * kind.
 */
export function smsNaira(kobo: number): string {
  const sign = kobo < 0 ? '-' : '';
  const whole = Math.floor(Math.abs(kobo) / 100);
  const part = Math.abs(kobo) % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}N${grouped}${part === 0 ? '' : `.${String(part).padStart(2, '0')}`}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

/** A day as an SMS writes it, in Lagos: `18 Oct`. */
export function smsDate(instant: Date): string {
  const lagos = new Date(instant.getTime() + LAGOS_OFFSET_MS);
  return `${lagos.getUTCDate()} ${MONTHS[lagos.getUTCMonth()]}`;
}

/**
 * Where a message goes: the number in the international form a provider
 * takes, without the `+` (`2348031234567`). `null` for a number that cannot
 * be read as a Nigerian one, which is recorded as unsendable and never
 * guessed at.
 */
export function smsRecipient(phone: string | null | undefined): string | null {
  if (!phone) {
    return null;
  }
  return tryNormalizeNigerianPhone(phone)?.slice(1) ?? null;
}

/** All of a number an officer is shown: its last four digits. */
export function smsLastFour(recipient: string): string {
  return recipient.slice(-4);
}

export type SmsDeliveryOutcome = 'DELIVERED' | 'FAILED' | 'PENDING';

/**
 * What a provider's delivery report means. Termii reports "Delivered",
 * "Message Sent" (handed to the network, nothing heard yet), and for a
 * failure "Message Failed", "Rejected", "Expired", or "DND Active on Phone
 * Number". Anything unknown is treated as still pending, never as delivered.
 */
export function smsDeliveryOutcome(status: string | null | undefined): SmsDeliveryOutcome {
  const value = (status ?? '').trim().toLowerCase();
  if (value === 'delivered') {
    return 'DELIVERED';
  }
  if (
    value === 'message failed' ||
    value === 'failed' ||
    value === 'rejected' ||
    value === 'expired' ||
    value.startsWith('dnd active')
  ) {
    return 'FAILED';
  }
  return 'PENDING';
}

/** Waits between attempts when the provider cannot be reached. */
export const SMS_RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
] as const;

/**
 * When to try again after a failed attempt, or `null` once every retry is
 * spent. `attempts` counts the attempts made so far, the failed one included.
 */
export function nextSmsAttempt(attempts: number, now: Date): Date | null {
  const delay = SMS_RETRY_DELAYS_MS[attempts - 1];
  return delay === undefined ? null : new Date(now.getTime() + delay);
}

/** A confirmation not sent within this long is stale, and is not sent. */
export const SMS_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
