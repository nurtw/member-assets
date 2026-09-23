import { describe, expect, it } from 'vitest';

import {
  blankToNull,
  mapDeclarationStatus,
  mapMemberStatus,
  matchLgaByName,
  parseLegacyBoolean,
  splitLegacyName,
} from './mapping.ts';

describe('parseLegacyBoolean', () => {
  it('recognises the forms actually seen in a CSV export', () => {
    for (const truthy of ['true', 'TRUE', 't', '1', 'yes', ' true ']) {
      expect(parseLegacyBoolean(truthy)).toBe(true);
    }
  });

  it('treats anything else, including absence, as false', () => {
    for (const falsy of ['false', 'f', '0', 'no', '', undefined, null]) {
      expect(parseLegacyBoolean(falsy)).toBe(false);
    }
  });
});

describe('blankToNull', () => {
  it('turns the empty-string-for-null defect into an actual null', () => {
    expect(blankToNull('')).toBeNull();
    expect(blankToNull('   ')).toBeNull();
    expect(blankToNull(undefined)).toBeNull();
  });

  it('preserves a real value, including one that looks falsy', () => {
    expect(blankToNull('0')).toBe('0');
    expect(blankToNull('  ABC-123  ')).toBe('ABC-123');
  });
});

describe('mapMemberStatus', () => {
  it('maps a clean ACTIVE record straight across, unflagged', () => {
    expect(mapMemberStatus('ACTIVE', false)).toEqual({
      status: 'ACTIVE',
      flagged: false,
    });
  });
});

describe('mapDeclarationStatus (ARCHITECTURE.md Decision 6.5)', () => {
  it('always maps to ON_RECORD — never ACTIVE, regardless of legacy status', () => {
    for (const legacyStatus of ['ACTIVE', 'INACTIVE', '', 'WHO_KNOWS', null, undefined]) {
      expect(mapDeclarationStatus(legacyStatus, false).status).toBe('ON_RECORD');
      expect(mapDeclarationStatus(legacyStatus, true).status).toBe('ON_RECORD');
    }
  });

  it('leaves a clean legacy ACTIVE, non-blacklisted row unflagged', () => {
    expect(mapDeclarationStatus('ACTIVE', false).flagged).toBe(false);
  });

  it('flags a legacy INACTIVE row for staff review', () => {
    expect(mapDeclarationStatus('INACTIVE', false).flagged).toBe(true);
  });

  it('flags a blacklisted row even over a legacy ACTIVE status', () => {
    expect(mapDeclarationStatus('ACTIVE', true).flagged).toBe(true);
  });

  it('flags an unrecognised or blank legacy status, never assuming clean', () => {
    expect(mapDeclarationStatus('', false).flagged).toBe(true);
    expect(mapDeclarationStatus('WHO_KNOWS', false).flagged).toBe(true);
  });

  it('preserves the legacy status as a note, so MIG-06 has something to act on', () => {
    expect(mapDeclarationStatus('ACTIVE', false).legacyStatusNote).toBe(
      'Legacy status: ACTIVE.',
    );
    expect(mapDeclarationStatus('inactive', true).legacyStatusNote).toBe(
      'Legacy status: INACTIVE (blacklisted).',
    );
    expect(mapDeclarationStatus(null, false).legacyStatusNote).toBe(
      'Legacy status: UNKNOWN.',
    );
  });
});

describe('splitLegacyName', () => {
  it('takes the first token as given name, the rest as surname', () => {
    expect(splitLegacyName('Chidi Okafor')).toEqual({
      firstName: 'Chidi',
      surname: 'Okafor',
    });
    expect(splitLegacyName('Chidi Nnamdi Okafor')).toEqual({
      firstName: 'Chidi',
      surname: 'Nnamdi Okafor',
    });
  });

  it('duplicates a single-word name rather than leaving a field blank', () => {
    expect(splitLegacyName('Chidi')).toEqual({
      firstName: 'Chidi',
      surname: 'Chidi',
    });
  });

  it('collapses irregular whitespace', () => {
    expect(splitLegacyName('  Chidi   Okafor  ')).toEqual({
      firstName: 'Chidi',
      surname: 'Okafor',
    });
  });
});

describe('matchLgaByName', () => {
  const known = [{ name: 'Anambra East' }, { name: 'Aguata' }];

  it('matches case- and whitespace-insensitively', () => {
    expect(matchLgaByName('  anambra   east ', known)).toEqual({
      name: 'Anambra East',
    });
  });

  it('returns null for blank input rather than the first entry', () => {
    expect(matchLgaByName('', known)).toBeNull();
    expect(matchLgaByName(undefined, known)).toBeNull();
  });

  it('returns null rather than guess at an unrecognised name', () => {
    expect(matchLgaByName('Made Up LGA', known)).toBeNull();
  });
});
