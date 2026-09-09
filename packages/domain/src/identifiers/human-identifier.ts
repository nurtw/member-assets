/**
 * Human-readable identifiers — membership numbers, card numbers, sticker ids.
 *
 * PRD §26.1 — opaque and non-sequential, rendered in a grouped, unambiguous
 * alphabet excluding characters liable to be confused in handwriting or speech.
 * They convey no branch, no sequence, and no issuance date, so that a member
 * transferring between branches keeps their identifier and no observer can infer
 * the size of the register from one example.
 *
 * That last property is the reason these are random rather than counted. A
 * sequential number tells anyone holding two cards roughly how many members the
 * Union has and when each joined, and it reduces brute-force enumeration to
 * counting.
 *
 * Randomness is supplied by the caller (`randomByte`) rather than imported here,
 * because this package must not depend on a runtime: the API passes Node's
 * `crypto`, and tests pass a deterministic sequence. A `Math.random` default is
 * deliberately *not* provided — a caller that forgot to supply a real source
 * would silently produce guessable identifiers.
 */

/**
 * Thirty-one symbols: the digits, and the letters less `I`, `L`, `O`, `U`, `Z`.
 *
 * `I`, `L`, and `O` go because they are read as `1`, `1`, and `0`; `U` goes
 * because Crockford drops it, and because it turns an unlucky draw into an
 * offensive string. That leaves Crockford's thirty-two.
 *
 * `Z` is then dropped purely to reach **thirty-one, which is prime**. The choice
 * of `Z` over any other symbol carries no meaning and encodes nothing; what
 * matters is the count, for the reason given at `CHECK_MODULUS`. Stated plainly
 * so nobody later "restores" the missing letter to tidy the alphabet up.
 */
export const IDENTIFIER_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXY';

/**
 * 31, prime — and the checksum's guarantees depend on that primality.
 *
 * A weighted sum modulo `m` with weights `w` detects every single-symbol error
 * only when every `w` is coprime to `m`, and every adjacent transposition only
 * when every `wᵢ - wᵢ₊₁` is coprime to `m`. With a prime modulus both hold for
 * free. With thirty-two symbols the even weights share a factor with the
 * modulus, and a single symbol misread by exactly sixteen positions would pass
 * the check undetected.
 */
const CHECK_MODULUS = IDENTIFIER_ALPHABET.length;

/** Symbols per group, and groups per identifier. 12 symbols + 1 check symbol. */
const GROUP_SIZE = 4;
const PAYLOAD_LENGTH = 12;

export class InvalidIdentifierError extends Error {
  override readonly name = 'InvalidIdentifierError';
}

/** Supplies one uniformly random byte. Node: `randomInt(256)`. */
export type RandomByteSource = () => number;

/**
 * Draws one symbol without modulo bias.
 *
 * `byte % 31` would favour the first ten symbols, because 256 is not a multiple
 * of 31. Values in the biased tail are discarded and redrawn instead. The bias
 * would be small, but "small bias in an identifier nobody may guess" is the kind
 * of defect that is never noticed and never fixed.
 */
function drawSymbol(randomByte: RandomByteSource): string {
  const limit = Math.floor(256 / CHECK_MODULUS) * CHECK_MODULUS;
  for (let attempt = 0; attempt < 64; attempt++) {
    const byte = randomByte();
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
      throw new InvalidIdentifierError(
        'The random source must return an integer between 0 and 255.',
      );
    }
    if (byte < limit) {
      return IDENTIFIER_ALPHABET[byte % CHECK_MODULUS] as string;
    }
  }
  // Unreachable with a working source; a source stuck in the rejected tail would
  // otherwise spin forever.
  throw new InvalidIdentifierError(
    'The random source failed to produce a usable value.',
  );
}

/**
 * The check symbol: a position-weighted sum modulo 31.
 *
 * Weighting by position is what catches transposition. An unweighted sum gives
 * `A B` and `B A` the same checksum, and adjacent transposition is the second
 * most common error when a number is read aloud and typed by someone else.
 */
export function checkSymbol(payload: string): string {
  let sum = 0;
  for (let i = 0; i < payload.length; i++) {
    const value = IDENTIFIER_ALPHABET.indexOf(payload[i] as string);
    if (value < 0) {
      throw new InvalidIdentifierError(
        `Identifier contains ${JSON.stringify(payload[i])}, which is not in the alphabet.`,
      );
    }
    sum += value * (i + 2);
  }
  return IDENTIFIER_ALPHABET[sum % CHECK_MODULUS] as string;
}

/** Groups a bare identifier for reading aloud: `ABCD-EFGH-JKMN-P`. */
export function formatIdentifier(bare: string): string {
  const groups: string[] = [];
  for (let i = 0; i < bare.length; i += GROUP_SIZE) {
    groups.push(bare.slice(i, i + GROUP_SIZE));
  }
  return groups.join('-');
}

/**
 * Strips formatting and normalises to the canonical alphabet.
 *
 * Maps the characters excluded from the alphabet onto what a person meant:
 * `I` and `L` to `1`, `O` to `0`. Someone reading a card aloud says "oh" for
 * zero, and rejecting that would be a support call rather than a security
 * control — the excluded symbols cannot occur in a genuine identifier, so
 * accepting them as their look-alike is unambiguous.
 */
export function normalizeIdentifier(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
}

/** Generates a formatted identifier with its check symbol. */
export function generateIdentifier(randomByte: RandomByteSource): string {
  let payload = '';
  for (let i = 0; i < PAYLOAD_LENGTH; i++) {
    payload += drawSymbol(randomByte);
  }
  return formatIdentifier(payload + checkSymbol(payload));
}

/**
 * True when the identifier is well formed and its check symbol agrees.
 *
 * A mistyped identifier fails here **before any database access**, which is the
 * same stance Requirement 26.1 takes for QR payloads: a malformed identifier is
 * not a lookup miss, and answering it with a query wastes the lookup and leaks
 * timing.
 */
export function isValidIdentifier(input: string): boolean {
  const bare = normalizeIdentifier(input);
  if (bare.length !== PAYLOAD_LENGTH + 1) {
    return false;
  }
  const payload = bare.slice(0, PAYLOAD_LENGTH);
  const provided = bare.slice(PAYLOAD_LENGTH);
  try {
    return checkSymbol(payload) === provided;
  } catch {
    return false;
  }
}

/** Normalises and validates, throwing on a malformed identifier. */
export function parseIdentifier(input: string): string {
  if (!isValidIdentifier(input)) {
    throw new InvalidIdentifierError('That identifier is not valid.');
  }
  return formatIdentifier(normalizeIdentifier(input));
}
