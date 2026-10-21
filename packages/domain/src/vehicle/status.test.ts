import { describe, expect, it } from 'vitest';

import {
  DECLARATION_STATUSES,
  InvalidDeclarationTransitionError,
  assertDeclarationTransition,
  blocksNewRecord,
  canTransitionDeclaration,
  isDeclarationFinal,
  isDeclarationLive,
  isWithheld,
  statusChangeTarget,
  statusOnLifting,
} from './status.js';

/**
 * The legal transitions, written out separately from the implementation —
 * an independent statement of the rule, not an import of the table under
 * test, so the exhaustive check below cannot compare the implementation
 * with itself.
 */
const LEGAL: readonly [string, string][] = [
  ['ON_RECORD', 'ACTIVE'],
  // Item 57: an undeclared vehicle may be suspended or retired.
  ['ON_RECORD', 'SUSPENDED'],
  ['ON_RECORD', 'RETIRED'],
  ['PENDING', 'ACTIVE'],
  ['PENDING', 'DISPUTED'],
  ['PENDING', 'ARCHIVED'],
  ['ACTIVE', 'SUSPENDED'],
  ['ACTIVE', 'RETIRED'],
  ['SUSPENDED', 'ACTIVE'],
  ['SUSPENDED', 'ON_RECORD'],
  ['SUSPENDED', 'RETIRED'],
  ['DISPUTED', 'ARCHIVED'],
];

describe('vehicle declaration lifecycle', () => {
  it('permits exactly the legal transitions and refuses every other pair', () => {
    const legal = new Set(LEGAL.map(([a, b]) => `${a}->${b}`));

    for (const from of DECLARATION_STATUSES) {
      for (const to of DECLARATION_STATUSES) {
        expect(canTransitionDeclaration(from, to), `${from} -> ${to}`).toBe(
          legal.has(`${from}->${to}`),
        );
      }
    }
  });

  it('refuses a status transitioning to itself', () => {
    for (const status of DECLARATION_STATUSES) {
      expect(canTransitionDeclaration(status, status)).toBe(false);
    }
  });

  it('treats RETIRED and ARCHIVED as final', () => {
    expect(isDeclarationFinal('RETIRED')).toBe(true);
    expect(isDeclarationFinal('ARCHIVED')).toBe(true);
    expect(isDeclarationFinal('ACTIVE')).toBe(false);
    expect(isDeclarationFinal('DISPUTED')).toBe(false);
  });

  it('promotes ON_RECORD to ACTIVE, never to DISPUTED', () => {
    // ARCHITECTURE.md Decision 6.5 — a migrated vehicle has no prior ACTIVE
    // declaration to compete with, so declaring it is always a promotion of
    // the same row, never a dispute.
    expect(canTransitionDeclaration('ON_RECORD', 'ACTIVE')).toBe(true);
    expect(canTransitionDeclaration('ON_RECORD', 'DISPUTED')).toBe(false);
  });

  it('never allows a disputed claim to become ACTIVE directly', () => {
    // Upholding a disputed claim would require demoting whichever record
    // currently holds ACTIVE for that plate — a policy call QUESTIONS.md
    // VEH-07 leaves open. Only dismissal (-> ARCHIVED) is built.
    expect(canTransitionDeclaration('DISPUTED', 'ACTIVE')).toBe(false);
  });

  it('does not allow a retired or archived declaration to be revived', () => {
    for (const from of ['RETIRED', 'ARCHIVED'] as const) {
      for (const to of DECLARATION_STATUSES) {
        expect(canTransitionDeclaration(from, to)).toBe(false);
      }
    }
  });

  it('allows suspension to reverse, unlike retirement', () => {
    expect(canTransitionDeclaration('SUSPENDED', 'ACTIVE')).toBe(true);
    expect(canTransitionDeclaration('RETIRED', 'ACTIVE')).toBe(false);
  });

  it('treats only ACTIVE as a live declaration', () => {
    expect(isDeclarationLive('ACTIVE')).toBe(true);
    for (const status of DECLARATION_STATUSES.filter((s) => s !== 'ACTIVE')) {
      expect(isDeclarationLive(status)).toBe(false);
    }
  });

  it('names the permitted transitions when it throws', () => {
    expect(() => assertDeclarationTransition('DISPUTED', 'SUSPENDED')).toThrow(
      InvalidDeclarationTransitionError,
    );
    expect(() => assertDeclarationTransition('DISPUTED', 'SUSPENDED')).toThrow(
      /Permitted: ARCHIVED/,
    );
  });

  it('says so plainly when the source status is final', () => {
    expect(() => assertDeclarationTransition('RETIRED', 'ACTIVE')).toThrow(
      /RETIRED is final/,
    );
  });

  it('accepts a legal transition silently', () => {
    expect(() =>
      assertDeclarationTransition('ACTIVE', 'SUSPENDED'),
    ).not.toThrow();
  });

  it('lets a retired or archived record be recorded afresh, and nothing else', () => {
    // Decision 6.6 — history does not block; a standing record does.
    expect(blocksNewRecord('RETIRED')).toBe(false);
    expect(blocksNewRecord('ARCHIVED')).toBe(false);
    for (const status of DECLARATION_STATUSES.filter(
      (s) => s !== 'RETIRED' && s !== 'ARCHIVED',
    )) {
      expect(blocksNewRecord(status)).toBe(true);
    }
  });
});

describe('withheld vehicles, and lifting a suspension (item 57)', () => {
  it('withholds only what an officer or the record has stopped', () => {
    expect(DECLARATION_STATUSES.filter(isWithheld)).toEqual([
      'SUSPENDED',
      'RETIRED',
      'DISPUTED',
      'ARCHIVED',
    ]);
  });

  it('lifts a suspension back to what the vehicle was, never declaring it', () => {
    expect(statusOnLifting(true)).toBe('ACTIVE');
    expect(statusOnLifting(false)).toBe('ON_RECORD');
  });
});

describe('statusChangeTarget (item 57)', () => {
  it('lifts a suspension to declared or on record, by whether it was declared', () => {
    expect(statusChangeTarget('SUSPENDED', 'ACTIVE', true)).toBe('ACTIVE');
    expect(statusChangeTarget('SUSPENDED', 'ACTIVE', false)).toBe('ON_RECORD');
  });

  it('never declares a vehicle on record by a status change', () => {
    expect(() => statusChangeTarget('ON_RECORD', 'ACTIVE', false)).toThrow(
      InvalidDeclarationTransitionError,
    );
  });

  it('suspends and retires as asked, the table deciding whether it may', () => {
    expect(statusChangeTarget('ON_RECORD', 'SUSPENDED', false)).toBe(
      'SUSPENDED',
    );
    expect(statusChangeTarget('ON_RECORD', 'RETIRED', false)).toBe('RETIRED');
    expect(statusChangeTarget('ACTIVE', 'RETIRED', true)).toBe('RETIRED');
  });
});
