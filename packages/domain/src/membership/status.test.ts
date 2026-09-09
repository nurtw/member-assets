import { describe, expect, it } from 'vitest';

import {
  APPLICATION_STATUSES,
  InvalidStatusTransitionError,
  MEMBER_STATUSES,
  assertApplicationTransition,
  assertMemberTransition,
  canTransitionApplication,
  canTransitionMember,
  isApplicationEditable,
  isApplicationFinal,
  isMemberFinal,
  isMemberInGoodStanding,
} from './status.js';

/**
 * The legal transitions, written out separately from the implementation.
 *
 * Deliberately a second, independent statement of the rule rather than an import
 * of the table under test — otherwise the exhaustive check below would compare
 * the implementation with itself and pass no matter what it said.
 */
const LEGAL_APPLICATION: readonly [string, string][] = [
  ['DRAFT', 'SUBMITTED'],
  ['DRAFT', 'WITHDRAWN'],
  ['SUBMITTED', 'UNDER_REVIEW'],
  ['SUBMITTED', 'APPROVED'],
  ['SUBMITTED', 'REJECTED'],
  ['SUBMITTED', 'WITHDRAWN'],
  ['UNDER_REVIEW', 'APPROVED'],
  ['UNDER_REVIEW', 'REJECTED'],
  ['UNDER_REVIEW', 'WITHDRAWN'],
];

const LEGAL_MEMBER: readonly [string, string][] = [
  ['PENDING', 'ACTIVE'],
  ['PENDING', 'CANCELLED'],
  ['ACTIVE', 'SUSPENDED'],
  ['ACTIVE', 'CANCELLED'],
  ['SUSPENDED', 'ACTIVE'],
  ['SUSPENDED', 'CANCELLED'],
];

describe('application lifecycle', () => {
  it('permits exactly the legal transitions and refuses every other pair', () => {
    const legal = new Set(LEGAL_APPLICATION.map(([a, b]) => `${a}->${b}`));

    for (const from of APPLICATION_STATUSES) {
      for (const to of APPLICATION_STATUSES) {
        expect(
          canTransitionApplication(from, to),
          `${from} -> ${to}`,
        ).toBe(legal.has(`${from}->${to}`));
      }
    }
  });

  it('refuses a status transitioning to itself', () => {
    for (const status of APPLICATION_STATUSES) {
      expect(canTransitionApplication(status, status)).toBe(false);
    }
  });

  it('treats a decision as final', () => {
    // A withdrawal after a refusal would let an applicant erase the record of it.
    expect(isApplicationFinal('APPROVED')).toBe(true);
    expect(isApplicationFinal('REJECTED')).toBe(true);
    expect(isApplicationFinal('WITHDRAWN')).toBe(true);
    expect(isApplicationFinal('DRAFT')).toBe(false);
    expect(isApplicationFinal('SUBMITTED')).toBe(false);
  });

  it('permits a decision without first claiming the application for review', () => {
    // A small office approves directly; requiring UNDER_REVIEW first would be a
    // workflow nobody follows.
    expect(canTransitionApplication('SUBMITTED', 'APPROVED')).toBe(true);
    expect(canTransitionApplication('SUBMITTED', 'REJECTED')).toBe(true);
  });

  it('does not allow a decision to be revisited', () => {
    expect(canTransitionApplication('REJECTED', 'APPROVED')).toBe(false);
    expect(canTransitionApplication('APPROVED', 'REJECTED')).toBe(false);
    expect(canTransitionApplication('WITHDRAWN', 'SUBMITTED')).toBe(false);
  });

  it('allows editing only in draft', () => {
    expect(isApplicationEditable('DRAFT')).toBe(true);
    for (const status of APPLICATION_STATUSES.filter((s) => s !== 'DRAFT')) {
      expect(isApplicationEditable(status)).toBe(false);
    }
  });

  it('names the permitted transitions when it throws', () => {
    expect(() => assertApplicationTransition('DRAFT', 'APPROVED')).toThrow(
      InvalidStatusTransitionError,
    );
    expect(() => assertApplicationTransition('DRAFT', 'APPROVED')).toThrow(
      /Permitted: SUBMITTED, WITHDRAWN/,
    );
  });

  it('says so plainly when the source status is final', () => {
    expect(() => assertApplicationTransition('APPROVED', 'DRAFT')).toThrow(
      /APPROVED is final/,
    );
  });

  it('accepts a legal transition silently', () => {
    expect(() =>
      assertApplicationTransition('SUBMITTED', 'APPROVED'),
    ).not.toThrow();
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
