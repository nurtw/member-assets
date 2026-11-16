import { describe, expect, it } from 'vitest';

import {
  MEMBER_STATUSES,
  assertMemberTransition,
  canTransitionMember,
  correctionRight,
  isMemberFinal,
  isMemberInGoodStanding,
} from './status.js';

/** The legal member transitions, written out apart from the table under test. */
const LEGAL_MEMBER: readonly [string, string][] = [
  ['PENDING', 'ACTIVE'],
  ['PENDING', 'CANCELLED'],
  ['ACTIVE', 'SUSPENDED'],
  ['ACTIVE', 'CANCELLED'],
  ['SUSPENDED', 'ACTIVE'],
  ['SUSPENDED', 'CANCELLED'],
];

describe('who may correct a registration (item 61, MEM-20)', () => {
  const base = { administrator: false, registeredByCaller: false, correctionUsed: false };

  it('lets an administrator correct at any time, however often', () => {
    expect(correctionRight({ ...base, administrator: true })).toBe('ANYTIME');
    expect(
      correctionRight({ ...base, administrator: true, correctionUsed: true }),
    ).toBe('ANYTIME');
  });

  it('gives the officer who registered the member one correction', () => {
    expect(correctionRight({ ...base, registeredByCaller: true })).toBe('ONCE');
    expect(
      correctionRight({ ...base, registeredByCaller: true, correctionUsed: true }),
    ).toBe('NONE');
  });

  it('gives anybody else none', () => {
    expect(correctionRight(base)).toBe('NONE');
    expect(correctionRight({ ...base, correctionUsed: true })).toBe('NONE');
  });
});

describe('member lifecycle', () => {
  it('permits exactly the legal transitions and refuses every other pair', () => {
    const legal = new Set(LEGAL_MEMBER.map(([a, b]) => `${a}->${b}`));

    for (const from of MEMBER_STATUSES) {
      for (const to of MEMBER_STATUSES) {
        expect(canTransitionMember(from, to), `${from} -> ${to}`).toBe(
          legal.has(`${from}->${to}`),
        );
      }
    }
  });

  it('reaches ACTIVE from PENDING and from suspension, and nowhere else', () => {
    // Approval is the only route into membership. Nothing else may activate a
    // pending applicant.
    const sources = MEMBER_STATUSES.filter((from) =>
      canTransitionMember(from, 'ACTIVE'),
    );
    expect(sources).toEqual(['PENDING', 'SUSPENDED']);
  });

  it('makes suspension reversible', () => {
    expect(canTransitionMember('ACTIVE', 'SUSPENDED')).toBe(true);
    expect(canTransitionMember('SUSPENDED', 'ACTIVE')).toBe(true);
  });

  it('makes cancellation terminal', () => {
    // The register must be able to answer "was this person a member on that
    // date"; a cancellation that could be silently undone defeats that.
    expect(isMemberFinal('CANCELLED')).toBe(true);
    for (const to of MEMBER_STATUSES) {
      expect(canTransitionMember('CANCELLED', to)).toBe(false);
    }
  });

  it('does not let a pending applicant be suspended', () => {
    // There is nothing yet to suspend. Refuse the application instead.
    expect(canTransitionMember('PENDING', 'SUSPENDED')).toBe(false);
  });

  it('counts only an active member as being in good standing', () => {
    expect(isMemberInGoodStanding('ACTIVE')).toBe(true);
    expect(isMemberInGoodStanding('PENDING')).toBe(false);
    expect(isMemberInGoodStanding('SUSPENDED')).toBe(false);
    expect(isMemberInGoodStanding('CANCELLED')).toBe(false);
  });

  it('names the permitted transitions when it throws', () => {
    expect(() => assertMemberTransition('PENDING', 'SUSPENDED')).toThrow(
      /Permitted: ACTIVE, CANCELLED/,
    );
    expect(() => assertMemberTransition('CANCELLED', 'ACTIVE')).toThrow(
      /CANCELLED is final/,
    );
  });
});
