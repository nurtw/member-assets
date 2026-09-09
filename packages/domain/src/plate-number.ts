/**
 * Plate-number normalisation.
 *
 * ARCHITECTURE.md Decision 6.1 — normalisation converts to upper case and removes
 * all non-alphanumeric characters. `plate_number_normalized` carries the unique
 * index and is the sole field ever used for lookup or uniqueness;
 * `plate_number_display` preserves the value exactly as entered.
 *
 * This function lives here, in a framework-independent package, because it is
 * applied at every write boundary. If it lived in a service, a second write path
 * could bypass it and admit an unnormalised value, which would silently defeat the
 * uniqueness constraint and the duplicate-declaration rule at PRD §9.2.
 *
 * Naming note: exported identifiers use "normalized" to match the canonical field
 * catalogue at PRD §24, which is the shared vocabulary with the Union. Prose in
 * this repository uses British spelling. The inconsistency is deliberate — the
 * field names are contractual and must not be silently re-spelled.
 */

/** Thrown when input cannot yield a usable normalised plate number. */
export class InvalidPlateNumberError extends Error {
  override readonly name = 'InvalidPlateNumberError';

  constructor(
    message: string,
    readonly reason: 'EMPTY' | 'TOO_SHORT' | 'TOO_LONG',
  ) {
    super(message);
  }
}

/**
 * Bounds exist to reject junk — an empty field, or a pasted paragraph — not to
 * enforce a plate format. Nigerian plate formats vary across private, commercial,
 * government, and diplomatic series, and the Union's register may legitimately
 * contain any of them.
 *
 * For reference, all 2,841 plates in the legacy export normalise to 6, 7, or 8
 * characters. These bounds are deliberately wider than that observed range so that
 * migration does not reject real records over a format assumption.
 */
export const MIN_NORMALIZED_PLATE_LENGTH = 3;
export const MAX_NORMALIZED_PLATE_LENGTH = 16;

/**
 * Reduces a plate number to its canonical comparable form.
 *
 * Unicode input is folded to its compatibility decomposition before stripping, so
 * that a full-width or accented character pasted from another system normalises to
 * the same value an operator would type by hand. Without this, two records that
 * look identical on screen could both be stored as "active" for the same vehicle.
 *
 * @throws {InvalidPlateNumberError} if nothing usable remains after normalisation.
 */
export function normalizePlateNumber(input: string): string {
  const normalized = input
    .normalize('NFKD')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  if (normalized.length === 0) {
    throw new InvalidPlateNumberError(
      'Plate number contains no alphanumeric characters.',
      'EMPTY',
    );
  }

  if (normalized.length < MIN_NORMALIZED_PLATE_LENGTH) {
    throw new InvalidPlateNumberError(
      `Plate number normalises to ${normalized.length} character(s); the minimum is ${MIN_NORMALIZED_PLATE_LENGTH}.`,
      'TOO_SHORT',
    );
  }

  if (normalized.length > MAX_NORMALIZED_PLATE_LENGTH) {
    throw new InvalidPlateNumberError(
      `Plate number normalises to ${normalized.length} characters; the maximum is ${MAX_NORMALIZED_PLATE_LENGTH}.`,
      'TOO_LONG',
    );
  }

  return normalized;
}

/**
 * Non-throwing variant, for validating operator input at the edge where a thrown
 * error would be the wrong control flow.
 */
export function tryNormalizePlateNumber(
  input: string,
): { ok: true; value: string } | { ok: false; error: InvalidPlateNumberError } {
  try {
    return { ok: true, value: normalizePlateNumber(input) };
  } catch (error) {
    if (error instanceof InvalidPlateNumberError) {
      return { ok: false, error };
    }
    throw error;
  }
}

/**
 * True when the value is already in canonical form.
 *
 * Intended for assertions at persistence boundaries — never as a substitute for
 * calling {@link normalizePlateNumber}, which is what actually guarantees the
 * invariant.
 */
export function isNormalizedPlateNumber(value: string): boolean {
  const result = tryNormalizePlateNumber(value);
  return result.ok && result.value === value;
}
