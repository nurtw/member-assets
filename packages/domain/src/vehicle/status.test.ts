import { describe, expect, it } from 'vitest';

import {
  DECLARATION_STATUSES,
  InvalidDeclarationTransitionError,
  assertDeclarationTransition,
  canTransitionDeclaration,
  isDeclarationFinal,
  isDeclarationLive,
} from './status.js';

/**
 * The legal transitions, written out separately from the implementation —
 * an independent statement of the rule, not an import of the table under
 * test, so the exhaustive check below cannot compare the implementation
 * with itself.
 */
const LEGAL: readonly [string, string][] = [
  ['PENDING', 'ACTIVE'],
  ['PENDING', 'DISPUTED'],
  ['PENDING', 'ARCHIVED'],
  ['ACTIVE', 'SUSPENDED'],
  ['ACTIVE', 'RETIRED'],
  ['SUSPENDED', 'ACTIVE'],
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
});
