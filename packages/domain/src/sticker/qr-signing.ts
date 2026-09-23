/**
 * The sticker QR payload (PRD §26.1–26.2, ARCHITECTURE.md Decision 6.2).
 *
 * The payload carries the opaque `stickerQrId`, a key identifier, and a
 * truncated HMAC — never the plate, member, or any other personal data
 * (Requirement 10.1). The signature is never stored: it is recomputed and
 * compared on every verification (CLAUDE.md).
 *
 * Framework-independent by design (`ARCHITECTURE.md` Decision 3.2): the
 * HMAC primitive is injected as `sign`, so this file has no dependency on
 * Node's `crypto` module and can be unit tested with a fake.
 */

const FIELD_SEPARATOR = '.';

/** Computes an HMAC and returns it as a hex string. Injected, not imported. */
export type HmacSigner = (secret: string, message: string) => string;

export interface QrPayload {
  readonly stickerQrId: string;
  readonly keyId: string;
}

/**
 * The truncated HMAC length. 16 hex characters (64 bits) is short enough to
 * keep the QR small and long enough that guessing a valid signature is
 * infeasible — a signature is necessary, never sufficient, on its own
 * (Decision 6.2.3): a database round trip still confirms the sticker's
 * actual status.
 */
const TRUNCATED_SIGNATURE_LENGTH = 16;

export function encodeQrPayload(
  payload: QrPayload,
  secret: string,
  sign: HmacSigner,
): string {
  const message = `${payload.stickerQrId}${FIELD_SEPARATOR}${payload.keyId}`;
  const signature = sign(secret, message).slice(0, TRUNCATED_SIGNATURE_LENGTH);
  return `${message}${FIELD_SEPARATOR}${signature}`;
}

export type QrVerificationResult =
  | { valid: true; stickerQrId: string; keyId: string }
  | { valid: false };

/**
 * Verifies a scanned payload. `resolveSecret` looks up the signing secret
 * for the key id embedded in the payload — never a single hard-coded
 * secret — so a rotated key still validates stickers minted under the
 * previous one (Decision 6.2.2). An unresolvable key id, a malformed
 * payload, and a mismatched signature all return the same `{ valid: false
 * }`: a forgery attempt and a scanning error are indistinguishable to the
 * caller, and neither may proceed to a database lookup (Decision 6.2.1).
 */
export function decodeAndVerifyQrPayload(
  rawPayload: string,
  resolveSecret: (keyId: string) => string | undefined,
  sign: HmacSigner,
  /**
   * Compares the computed and presented signatures. Defaults to `===`,
   * which is fine here because callers pass hex strings of equal expected
   * length — but the API layer should inject `crypto.timingSafeEqual`
   * (length-checked first) so a real attacker cannot use response timing
   * to guess a signature one byte at a time.
   */
  compare: (a: string, b: string) => boolean = (a, b) => a === b,
): QrVerificationResult {
  const parts = rawPayload.split(FIELD_SEPARATOR);
  if (parts.length !== 3) {
    return { valid: false };
  }
  const [stickerQrId, keyId, signature] = parts as [string, string, string];
  if (!stickerQrId || !keyId || !signature) {
    return { valid: false };
  }

  const secret = resolveSecret(keyId);
  if (!secret) {
    return { valid: false };
  }

  const message = `${stickerQrId}${FIELD_SEPARATOR}${keyId}`;
  const expected = sign(secret, message).slice(0, TRUNCATED_SIGNATURE_LENGTH);

  if (expected.length !== signature.length || !compare(expected, signature)) {
    return { valid: false };
  }
  return { valid: true, stickerQrId, keyId };
}
