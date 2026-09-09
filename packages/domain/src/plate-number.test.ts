import { describe, expect, it } from 'vitest';

import {
  InvalidPlateNumberError,
  MAX_NORMALIZED_PLATE_LENGTH,
  isNormalizedPlateNumber,
  normalizePlateNumber,
  tryNormalizePlateNumber,
} from './plate-number.js';

/**
 * ARCHITECTURE.md Decision 13.1 lists plate normalisation, including malformed
 * input, as requiring coverage before the item introducing it is complete.
 *
 * Fixtures here are synthetic. Per PRD §25.2 no row from data/ is reproduced in a
 * test, so the plate shapes below are invented rather than taken from the export.
 */
describe('normalizePlateNumber', () => {
  it('upper-cases and strips separators', () => {
    expect(normalizePlateNumber('abc 123 xy')).toBe('ABC123XY');
    expect(normalizePlateNumber('ABC-123-XY')).toBe('ABC123XY');
    expect(normalizePlateNumber('abc/123/xy')).toBe('ABC123XY');
  });

  it('treats differently punctuated forms of one plate as equal', () => {
    const variants = ['ABC123XY', 'abc 123 xy', 'ABC-123-XY', ' abc123xy '];
    const normalized = new Set(variants.map(normalizePlateNumber));

    // The uniqueness constraint at PRD §9.2 depends on this collapsing to one value.
    expect(normalized.size).toBe(1);
  });

  it('folds unicode look-alikes to their ASCII form', () => {
    // Full-width characters pasted from another system must not create a second
    // record that appears identical on screen to an existing one.
    expect(normalizePlateNumber('ＡＢＣ１２３ＸＹ')).toBe('ABC123XY');
  });

  it('strips diacritics rather than discarding the character', () => {
    expect(normalizePlateNumber('ÁBC123XY')).toBe('ABC123XY');
  });

  it('is idempotent', () => {
    const once = normalizePlateNumber('abc 123 xy');
    expect(normalizePlateNumber(once)).toBe(once);
  });

  it('accepts the length range present in the legacy register', () => {
    // The export normalises to 6, 7, or 8 characters throughout.
    expect(normalizePlateNumber('AB123X')).toBe('AB123X');
    expect(normalizePlateNumber('ABC123X')).toBe('ABC123X');
    expect(normalizePlateNumber('ABC123XY')).toBe('ABC123XY');
  });

  it.each([
    ['empty string', ''],
    ['whitespace only', '   '],
    ['punctuation only', '---'],
  ])('rejects %s as EMPTY', (_label, input) => {
    expect(() => normalizePlateNumber(input)).toThrow(InvalidPlateNumberError);
    expect(tryNormalizePlateNumber(input)).toMatchObject({
      ok: false,
      error: { reason: 'EMPTY' },
    });
  });

  it('rejects input that is too short to be a plate', () => {
    expect(tryNormalizePlateNumber('AB')).toMatchObject({
      ok: false,
      error: { reason: 'TOO_SHORT' },
    });
  });

  it('rejects input that is too long to be a plate', () => {
    const overlong = 'A'.repeat(MAX_NORMALIZED_PLATE_LENGTH + 1);
    expect(tryNormalizePlateNumber(overlong)).toMatchObject({
      ok: false,
      error: { reason: 'TOO_LONG' },
    });
  });
});

describe('tryNormalizePlateNumber', () => {
  it('returns the normalised value on success', () => {
    expect(tryNormalizePlateNumber('abc 123 xy')).toEqual({
      ok: true,
      value: 'ABC123XY',
    });
  });
});

describe('isNormalizedPlateNumber', () => {
  it('accepts canonical values only', () => {
    expect(isNormalizedPlateNumber('ABC123XY')).toBe(true);
    expect(isNormalizedPlateNumber('abc123xy')).toBe(false);
    expect(isNormalizedPlateNumber('ABC 123 XY')).toBe(false);
    expect(isNormalizedPlateNumber('')).toBe(false);
  });
});
