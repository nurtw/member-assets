import { describe, expect, it } from 'vitest';

import { CARD_ADDRESS_LENGTH, suggestCardAddress } from './display-address.js';

describe('suggestCardAddress', () => {
  it('returns a short address unchanged', () => {
    expect(suggestCardAddress('14 Zik Avenue, Awka')).toBe('14 Zik Avenue, Awka');
  });

  it('returns an empty string for a missing address', () => {
    expect(suggestCardAddress(null)).toBe('');
    expect(suggestCardAddress(undefined)).toBe('');
    expect(suggestCardAddress('   ')).toBe('');
  });

  it('never exceeds the limit', () => {
    const long =
      '512 Road, Festac Town, Amuwo-Odofin, Lagos State, Federal Republic of Nigeria';
    expect(suggestCardAddress(long).length).toBeLessThanOrEqual(
      CARD_ADDRESS_LENGTH,
    );
  });

  it('cuts at the last comma rather than mid-word', () => {
    // A hard 30-character slice would give "512 Road, Festac Town, Amuwo-Od",
    // which looks like a defect on a printed card.
    expect(suggestCardAddress('512 Road, Festac Town, Amuwo-Odofin, Lagos')).toBe(
      '512 Road, Festac Town',
    );
  });

  it('falls back to the last space when there is no comma in range', () => {
    expect(suggestCardAddress('14 Zik Avenue Ifite Awka Anambra State')).toBe(
      '14 Zik Avenue Ifite Awka',
    );
  });

  it('never ends mid-word when a boundary exists', () => {
    const cases = [
      '512 Road, Festac Town, Amuwo-Odofin, Lagos',
      '14 Zik Avenue Ifite Awka Anambra State',
      'Plot 7 Nnamdi Azikiwe Way, Onitsha, Anambra',
    ];
    for (const source of cases) {
      const suggestion = suggestCardAddress(source);
      // Whatever it returns must be a prefix of the source, ending where the
      // source has a boundary or where the source itself ends.
      const next = source.charAt(suggestion.length);
      expect(source.startsWith(suggestion), source).toBe(true);
      expect([',', ' ', ''], `${source} -> "${suggestion}"`).toContain(next);
    }
  });

  it('adds no ellipsis', () => {
    // The result is an address in its own right, not a truncated quotation of
    // one. An ellipsis would state that something is missing.
    const suggestion = suggestCardAddress(
      '512 Road, Festac Town, Amuwo-Odofin, Lagos',
    );
    expect(suggestion).not.toContain('…');
    expect(suggestion).not.toContain('...');
  });

  it('cuts a single over-long word at the limit, having no boundary to prefer', () => {
    const word = 'A'.repeat(80);
    expect(suggestCardAddress(word)).toBe('A'.repeat(CARD_ADDRESS_LENGTH));
  });

  it('collapses runs of whitespace, including newlines from a pasted address', () => {
    expect(suggestCardAddress('14  Zik   Avenue,\n Awka')).toBe(
      '14 Zik Avenue, Awka',
    );
  });

  it('leaves no trailing space or comma', () => {
    const suggestion = suggestCardAddress(
      '512 Road, Festac Town, Amuwo-Odofin, Lagos',
    );
    expect(suggestion).toBe(suggestion.trim());
    expect(suggestion.endsWith(',')).toBe(false);
  });

  it('honours a caller-supplied limit', () => {
    expect(suggestCardAddress('14 Zik Avenue, Awka', 10)).toBe('14 Zik');
  });

  it('always satisfies the API’s minimum where the source does', () => {
    // `draftCardSchema` requires at least 4 characters. A suggestion shorter
    // than that would be rejected on submission, which would be a worse
    // experience than an empty field.
    const sources = [
      '14 Zik Avenue, Awka',
      '512 Road, Festac Town, Amuwo-Odofin, Lagos',
      'Plot 7 Nnamdi Azikiwe Way, Onitsha, Anambra',
      'A'.repeat(80),
    ];
    for (const source of sources) {
      expect(suggestCardAddress(source).length, source).toBeGreaterThanOrEqual(4);
    }
  });
});
