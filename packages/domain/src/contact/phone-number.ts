/**
 * Nigerian telephone numbers.
 *
 * The registration form asks for three of them — operator, next of kin, and
 * guarantor — and specifies "Nigerian number validation". Numbers are stored in
 * a single canonical form so that the same person written down three different
 * ways is recognisably the same person.
 *
 * Canonical form is E.164: `+234` followed by ten digits. Officers will type
 * `0803 123 4567`, `+234 803 123 4567`, and `234-803-123-4567` for one number;
 * storing what was typed makes duplicate detection impossible and makes a later
 * SMS integration a data-cleaning exercise.
 *
 * This does not verify that a number is *in service*. It establishes that the
 * value is a well-formed Nigerian number and reduces it to one shape.
 */

export const NIGERIA_COUNTRY_CODE = '234';

/** Ten digits after the country code; the national form has a leading zero. */
const NATIONAL_SIGNIFICANT_DIGITS = 10;

export class InvalidPhoneNumberError extends Error {
  override readonly name = 'InvalidPhoneNumberError';
}

/**
 * Normalises to `+234XXXXXXXXXX`.
 *
 * Accepts the national form (`0803…`), the international form with or without
 * `+`, and any arrangement of spaces, hyphens, brackets, or dots between digits.
 *
 * A number already carrying the country code but *also* a national trunk zero —
 * `+2340803…`, which people produce by pasting a country code in front of what
 * they had — is repaired rather than rejected. It is unambiguous: no valid
 * significant number begins with zero.
 */
export function normalizeNigerianPhone(input: string): string {
  const digitsOnly = input.replace(/[^\d+]/g, '');

  if (digitsOnly.length === 0) {
    throw new InvalidPhoneNumberError('A telephone number is required.');
  }

  let digits = digitsOnly.replace(/^\+/, '');

  if (digits.startsWith(NIGERIA_COUNTRY_CODE)) {
    digits = digits.slice(NIGERIA_COUNTRY_CODE.length);
    // `+2340803…` — a country code pasted in front of the national form.
    if (digits.length === NATIONAL_SIGNIFICANT_DIGITS + 1 && digits.startsWith('0')) {
      digits = digits.slice(1);
    }
  } else if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (digits.length !== NATIONAL_SIGNIFICANT_DIGITS) {
    throw new InvalidPhoneNumberError(
      `A Nigerian number has ${NATIONAL_SIGNIFICANT_DIGITS} digits after the country code; ${digits.length} were supplied.`,
    );
  }

  if (digits.startsWith('0')) {
    throw new InvalidPhoneNumberError(
      'A Nigerian number does not begin with zero after the country code.',
    );
  }

  return `+${NIGERIA_COUNTRY_CODE}${digits}`;
}

export function tryNormalizeNigerianPhone(input: string): string | null {
  try {
    return normalizeNigerianPhone(input);
  } catch {
    return null;
  }
}

export function isNigerianPhone(input: string): boolean {
  return tryNormalizeNigerianPhone(input) !== null;
}

/**
 * Renders a stored number for display: `0803 123 4567`.
 *
 * The national form, because that is how a Nigerian officer reads a number back
 * to a member over the telephone. Storage stays international.
 */
export function formatNigerianPhone(canonical: string): string {
  const digits = canonical.replace(/^\+?234/, '');
  if (digits.length !== NATIONAL_SIGNIFICANT_DIGITS) {
    return canonical;
  }
  return `0${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}
