import { describe, expect, it } from 'vitest';

import { CARD_STATUSES } from '../card/status.js';
import { MEMBER_STATUSES } from '../membership/status.js';
import {
  MEMBERSHIP_LIMITATION,
  MEMBERSHIP_MATCH_STATEMENT,
  decideMembershipVerification,
} from './membership.js';

const NOW = new Date('2026-10-03T09:00:00Z');
const ACTIVE_CARD = { status: 'ACTIVE' as const, expiryDate: null };

describe('decideMembershipVerification — by card number', () => {
  it('matches an ACTIVE, in-date card held by an active member', () => {
    expect(
      decideMembershipVerification({
        foundAs: 'CARD_NUMBER',
        member: { status: 'ACTIVE' },
        card: {
          status: 'ACTIVE',
          expiryDate: new Date('2027-01-01T00:00:00Z'),
        },
        now: NOW,
      }),
    ).toEqual({ matched: true, reasons: [] });
  });

  it('matches only an ACTIVE card, whatever else its status is', () => {
    for (const status of CARD_STATUSES) {
      const result = decideMembershipVerification({
        foundAs: 'CARD_NUMBER',
        member: { status: 'ACTIVE' },
        card: { status, expiryDate: null },
        now: NOW,
      });
      expect(result.matched).toBe(status === 'ACTIVE');
      if (status !== 'ACTIVE') {
        expect(result.reasons).toEqual(['CARD_NOT_ACTIVE']);
      }
    }
  });

  it('refuses a card past its expiry date, though still marked ACTIVE', () => {
    expect(
      decideMembershipVerification({
        foundAs: 'CARD_NUMBER',
        member: { status: 'ACTIVE' },
        card: { status: 'ACTIVE', expiryDate: NOW },
        now: NOW,
      }).reasons,
    ).toEqual(['CARD_EXPIRED']);
  });

  it('refuses a good card held by a member who is not in good standing', () => {
    expect(
      decideMembershipVerification({
        foundAs: 'CARD_NUMBER',
        member: { status: 'SUSPENDED' },
        card: ACTIVE_CARD,
        now: NOW,
      }).reasons,
    ).toEqual(['MEMBER_NOT_ACTIVE']);
  });
});

describe('decideMembershipVerification — by membership number', () => {
  it('matches only a member in good standing, whatever their card', () => {
    for (const status of MEMBER_STATUSES) {
      const result = decideMembershipVerification({
        foundAs: 'MEMBERSHIP_NUMBER',
        member: { status },
        card: null,
        now: NOW,
      });
      expect(result.matched).toBe(status === 'ACTIVE');
      if (status !== 'ACTIVE') {
        expect(result.reasons).toEqual(['MEMBER_NOT_ACTIVE']);
      }
    }
  });
});

describe('decideMembershipVerification — nothing found', () => {
  it('reports no record, and nothing else', () => {
    expect(
      decideMembershipVerification({
        foundAs: null,
        member: null,
        card: null,
        now: NOW,
      }),
    ).toEqual({ matched: false, reasons: ['NO_RECORD'] });
  });
});

describe('membership verdict copy (PRD Requirement 11.1, §22)', () => {
  it('states the matter verified in the wording the PRD requires', () => {
    expect(MEMBERSHIP_MATCH_STATEMENT).toMatch(
      /^A matching NURTW membership record was found under the requested verification criteria\.$/,
    );
  });

  it('claims no identity beyond what the Union recorded', () => {
    expect(MEMBERSHIP_MATCH_STATEMENT.toLowerCase()).not.toMatch(
      /identity|genuine|certif/,
    );
    expect(MEMBERSHIP_LIMITATION).toMatch(/does not establish identity/);
  });
});
