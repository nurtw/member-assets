import { createHash, randomBytes, randomInt } from 'node:crypto';

/**
 * The form of an external API token (PRD Requirements 12.1–12.2, item 11).
 *
 *     nurtw_<8 characters>_<43 characters>
 *
 * - `nurtw_` lets a secret scanner recognise a token that has been pasted
 *   somewhere it should not be.
 * - The eight characters are the **prefix**. They are not secret: they
 *   identify a token on a screen and in the audit trail, and are stored in the
 *   clear so an officer can say which token is meant.
 * - The 43 characters are 32 random bytes, and are the secret.
 *
 * Only the SHA-256 of the whole token is stored. A fast hash is right here,
 * where it would be wrong for a password: the secret is 256 bits from a
 * CSPRNG, so there is no dictionary to try and nothing to slow down. It is
 * the reasoning `SessionService` gives for session tokens.
 *
 * No decorators and no Nest imports, so the functions can be tested alone.
 */

/** No `i`, `l`, `o`, `0`, or `1`: a prefix is read aloud and typed. */
const PREFIX_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const PREFIX_LENGTH = 8;
const SECRET_BYTES = 32;

const API_TOKEN_PATTERN = /^nurtw_[a-hjkmnp-z2-9]{8}_[A-Za-z0-9_-]{43}$/;

export interface GeneratedApiToken {
  /** The whole token. Returned once, to the officer who created it. */
  readonly token: string;
  /** `nurtw_` and the eight characters. Stored and shown. */
  readonly prefix: string;
  /** What is stored in place of the token. */
  readonly hash: string;
}

export function hashApiToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateApiToken(): GeneratedApiToken {
  let identifier = '';
  for (let index = 0; index < PREFIX_LENGTH; index++) {
    identifier += PREFIX_ALPHABET[randomInt(PREFIX_ALPHABET.length)];
  }
  const prefix = `nurtw_${identifier}`;
  const token = `${prefix}_${randomBytes(SECRET_BYTES).toString('base64url')}`;
  return { token, prefix, hash: hashApiToken(token) };
}

/** Whether a string has the form of a token. It says nothing of its validity. */
export function isWellFormedApiToken(token: string): boolean {
  return API_TOKEN_PATTERN.test(token);
}

/**
 * The token from an `Authorization: Bearer …` header, or `null`.
 *
 * The header is the only place a token is read from (Requirement 12.2). A
 * query string, a cookie, and a request body are never looked at, so a token
 * cannot be put where it would be logged or cached and still work.
 */
export function bearerToken(header: string | undefined): string | null {
  if (header === undefined) {
    return null;
  }
  const match = /^Bearer ([^\s]+)$/.exec(header);
  return match?.[1] ?? null;
}
