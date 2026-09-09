import { describe, expect, it } from 'vitest';

import {
  IDENTIFIER_ALPHABET,
  InvalidIdentifierError,
  checkSymbol,
  formatIdentifier,
  generateIdentifier,
  isValidIdentifier,
  normalizeIdentifier,
  parseIdentifier,
  type RandomByteSource,
} from './human-identifier.js';

/** A deterministic source, so generation is reproducible in tests. */
function sequence(bytes: readonly number[]): RandomByteSource {
  let index = 0;
  return () => bytes[index++ % bytes.length] as number;
}

const bare = (formatted: string) => formatted.replace(/-/g, '');

describe('alphabet', () => {
  it('excludes every character confusable in speech or handwriting', () => {
    for (const excluded of ['I', 'L', 'O', 'U']) {
      expect(IDENTIFIER_ALPHABET).not.toContain(excluded);
    }
  });

  it('contains no duplicates', () => {
    expect(new Set(IDENTIFIER_ALPHABET).size).toBe(IDENTIFIER_ALPHABET.length);
  });

  it('is prime in size, which the checksum guarantees depend on', () => {
    const size = IDENTIFIER_ALPHABET.length;
    expect(size).toBe(31);
    for (let divisor = 2; divisor * divisor <= size; divisor++) {
      expect(size % divisor).not.toBe(0);
    }
  });
});

describe('generateIdentifier', () => {
  it('produces four groups of four, hyphen separated', () => {
    const identifier = generateIdentifier(sequence([7]));
    expect(identifier).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]$/);
    expect(bare(identifier)).toHaveLength(13);
  });

  it('validates its own output', () => {
    for (let seed = 0; seed < 40; seed++) {
      const identifier = generateIdentifier(sequence([seed, seed * 3, seed + 11]));
      expect(isValidIdentifier(identifier)).toBe(true);
    }
  });

  it('uses only alphabet symbols', () => {
    const identifier = bare(generateIdentifier(sequence([1, 2, 3, 5, 8, 13])));
    for (const symbol of identifier) {
      expect(IDENTIFIER_ALPHABET).toContain(symbol);
    }
  });

  it('is deterministic for a given source', () => {
    const bytes = [3, 19, 200, 44, 7];
    expect(generateIdentifier(sequence(bytes))).toBe(
      generateIdentifier(sequence(bytes)),
    );
  });

  it('discards bytes in the biased tail rather than folding them', () => {
    // floor(256/31)*31 = 248, so 248..255 must be rejected and redrawn. Folding
    // them in would over-represent the first eight symbols on every draw.
    const rejected = [248, 249, 250, 251, 252, 253, 254, 255];
    const viaTail = generateIdentifier(sequence([...rejected, 0]));
    const viaZero = generateIdentifier(sequence([0]));
    expect(viaTail).toBe(viaZero);
  });

  it('refuses a source returning a value outside a byte', () => {
    expect(() => generateIdentifier(() => 300)).toThrow(InvalidIdentifierError);
    expect(() => generateIdentifier(() => -1)).toThrow(InvalidIdentifierError);
    expect(() => generateIdentifier(() => 1.5)).toThrow(InvalidIdentifierError);
  });

  it('gives different identifiers for different randomness', () => {
    const first = generateIdentifier(sequence([1]));
    const second = generateIdentifier(sequence([2]));
    expect(first).not.toBe(second);
  });
});

describe('check symbol — error detection', () => {
  // These two are the reason the alphabet is prime. Brute-forced rather than
  // sampled: the guarantee is "every such error", not "most".
  const samples = [
    bare(generateIdentifier(sequence([5, 90, 17, 233, 41]))),
    bare(generateIdentifier(sequence([0]))),
    bare(generateIdentifier(sequence([30, 61, 92, 123]))),
  ];

  it('detects every single-symbol substitution, in every position', () => {
    for (const identifier of samples) {
      for (let position = 0; position < identifier.length; position++) {
        for (const replacement of IDENTIFIER_ALPHABET) {
          if (replacement === identifier[position]) {
            continue;
          }
          const mistyped =
            identifier.slice(0, position) +
            replacement +
            identifier.slice(position + 1);
          expect(
            isValidIdentifier(mistyped),
            `${identifier} -> ${mistyped} was accepted`,
          ).toBe(false);
        }
      }
    }
  });

  it('detects every transposition of two adjacent symbols', () => {
    // The second most common error when a number is read aloud by one person
    // and typed by another. An unweighted checksum would miss all of these.
    for (const identifier of samples) {
      for (let position = 0; position < identifier.length - 1; position++) {
        const a = identifier[position] as string;
        const b = identifier[position + 1] as string;
        if (a === b) {
          continue;
        }
        const swapped =
          identifier.slice(0, position) + b + a + identifier.slice(position + 2);
        expect(
          isValidIdentifier(swapped),
          `${identifier} -> ${swapped} was accepted`,
        ).toBe(false);
      }
    }
  });

  it('rejects a symbol outside the alphabet', () => {
    expect(() => checkSymbol('ABC$')).toThrow(InvalidIdentifierError);
  });
});

describe('normalizeIdentifier', () => {
  it('strips hyphens, spaces, and case', () => {
    expect(normalizeIdentifier('abcd-efgh')).toBe('ABCDEFGH');
    expect(normalizeIdentifier(' ABCD EFGH ')).toBe('ABCDEFGH');
  });

  it('reads the excluded look-alikes as what the speaker meant', () => {
    // "oh" for zero, "eye" for one. These symbols cannot occur in a genuine
    // identifier, so accepting them as their look-alike is unambiguous rather
    // than lenient.
    expect(normalizeIdentifier('O0')).toBe('00');
    expect(normalizeIdentifier('IL1')).toBe('111');
  });
});

describe('isValidIdentifier', () => {
  const valid = generateIdentifier(sequence([11, 47, 3, 199]));

  it('accepts a genuine identifier however it is punctuated or cased', () => {
    expect(isValidIdentifier(valid)).toBe(true);
    expect(isValidIdentifier(valid.toLowerCase())).toBe(true);
    expect(isValidIdentifier(bare(valid))).toBe(true);
    expect(isValidIdentifier(` ${valid} `)).toBe(true);
  });

  it('rejects a wrong length without consulting anything', () => {
    expect(isValidIdentifier('')).toBe(false);
    expect(isValidIdentifier('ABCD')).toBe(false);
    expect(isValidIdentifier(`${bare(valid)}X`)).toBe(false);
  });

  it('rejects a symbol outside the alphabet rather than throwing', () => {
    // Callers use this as a predicate on user input; it must not explode.
    const twelve = bare(valid).slice(0, 12);
    expect(isValidIdentifier(`${twelve}$`)).toBe(false);
    expect(isValidIdentifier('$$$$$$$$$$$$$')).toBe(false);
  });
});

describe('parseIdentifier', () => {
  const valid = generateIdentifier(sequence([64, 8, 250, 12]));

  it('returns the canonical formatted form', () => {
    expect(parseIdentifier(valid.toLowerCase())).toBe(valid);
    expect(parseIdentifier(bare(valid))).toBe(valid);
  });

  it('throws on a mistyped identifier', () => {
    const wrong = `${bare(valid).slice(0, 12)}${
      bare(valid)[12] === '0' ? '1' : '0'
    }`;
    expect(() => parseIdentifier(wrong)).toThrow(InvalidIdentifierError);
  });

  it('round-trips through formatting', () => {
    expect(formatIdentifier(normalizeIdentifier(valid))).toBe(valid);
  });
});
