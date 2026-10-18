import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * The second factor (PRD Requirement 17.1, ARCHITECTURE.md Decision 9.3 —
 * item 28): time-based one-time passwords as RFC 6238 defines them, the kind
 * every authenticator app produces, and one-use recovery codes for a lost
 * phone.
 *
 * Built on `node:crypto` alone, like the password hashing: no dependency to
 * audit, and no Nest decorator, so a script can import it.
 *
 * - SHA-1, six digits, thirty seconds. Those are the defaults an authenticator
 *   app assumes; anything else and some apps silently produce wrong codes.
 * - One step either side is accepted, for a phone clock that has drifted.
 * - A step is accepted once (`mfaLastStep`), so a code seen over a shoulder
 *   cannot be used again inside its thirty seconds.
 */

const STEP_SECONDS = 30;
const DIGITS = 6;
/** Steps either side of now that are accepted. */
const WINDOW = 1;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of text.replace(/[\s=-]/g, '').toUpperCase()) {
    const index = BASE32.indexOf(character);
    if (index === -1) {
      throw new Error('Not a base32 string.');
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** A new shared secret: 160 bits, as RFC 4226 recommends, in base32. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpStep(now: Date): number {
  return Math.floor(now.getTime() / 1000 / STEP_SECONDS);
}

/** The code for one time step (RFC 4226 §5.3, dynamic truncation). */
export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', base32Decode(secret))
    .update(counter)
    .digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

/**
 * The time step a code is valid for, or `null`. A step at or before
 * `lastStep` is refused: that code has been used.
 */
export function verifyTotp(
  secret: string,
  code: string,
  now: Date,
  lastStep: number | null,
): number | null {
  const presented = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(presented)) {
    return null;
  }
  const current = totpStep(now);
  for (let offset = -WINDOW; offset <= WINDOW; offset += 1) {
    const step = current + offset;
    if (lastStep !== null && step <= lastStep) {
      continue;
    }
    const expected = Buffer.from(totpCode(secret, step));
    if (timingSafeEqual(expected, Buffer.from(presented))) {
      return step;
    }
  }
  return null;
}

/** What an authenticator app reads to set the account up. */
export function otpauthUri(secret: string, email: string): string {
  const label = encodeURIComponent(`NURTW:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=NURTW&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

// --- Recovery codes -----------------------------------------------------------

const RECOVERY_CODES = 10;

/** `XXXX-XXXX-XXXX-XXXX`: 80 bits, so its hash cannot be searched. */
export function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODES }, () => {
    const text = base32Encode(randomBytes(10));
    return text.match(/.{4}/g)!.join('-');
  });
}

/** Whether a presented value has the form of a recovery code. */
export function looksLikeRecoveryCode(value: string): boolean {
  return /^[A-Z2-7]{16}$/.test(normaliseRecoveryCode(value));
}

export function normaliseRecoveryCode(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

/** SHA-256, as for session and API tokens: the code is random, not chosen. */
export function hashRecoveryCode(value: string): string {
  return createHash('sha256')
    .update(normaliseRecoveryCode(value))
    .digest('hex');
}

// --- The secret at rest -----------------------------------------------------------

/**
 * The shared secret is the one thing here that must be recoverable, so it is
 * encrypted, not hashed, under `MFA_ENCRYPTION_KEY`. A leaked database backup
 * then yields no working second factor. The sealing is shared with the
 * member's NIN (item 44), so it lives in `common/secret-box.ts`.
 */
export { decryptSecret, encryptSecret } from '../common/secret-box.js';
