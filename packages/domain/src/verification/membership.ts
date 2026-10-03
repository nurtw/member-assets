/**
 * Membership verification (PRD §11, proposal §15's Membership verification
 * profile — item 24).
 *
 * An officer checks the card a driver shows: by the card's number, or by the
 * membership number printed on it. One rule serves the internal channels now
 * and the external `member:verify:membership` endpoint later, as
 * `decideVerification` does for vehicles.
 */

import { isCardVerifiable, type CardStatus } from '../card/status.js';
import {
  isMemberInGoodStanding,
  type MemberStatus,
} from '../membership/status.js';

/** What the presented number turned out to be. */
export type MembershipLookup = 'CARD_NUMBER' | 'MEMBERSHIP_NUMBER';

/** Why a membership check did not match, most decisive first. */
export const MEMBERSHIP_NOT_VERIFIED_REASONS = [
  /** No card and no member answers to the number. */
  'NO_RECORD',
  /** Pending approval, suspended, or cancelled. */
  'MEMBER_NOT_ACTIVE',
  /** Not handed over yet, replaced, lost, suspended, or cancelled. */
  'CARD_NOT_ACTIVE',
  /** Past the expiry date printed on it. */
  'CARD_EXPIRED',
] as const;
export type MembershipNotVerifiedReason =
  (typeof MEMBERSHIP_NOT_VERIFIED_REASONS)[number];

export interface MembershipFacts {
  /** `null` when the number answered to nothing. */
  foundAs: MembershipLookup | null;
  member: { status: MemberStatus } | null;
  /** The card presented, for a card number. Ignored for a membership number. */
  card: { status: CardStatus; expiryDate: Date | null } | null;
  now: Date;
}

export type MembershipVerdict =
  | { matched: true; reasons: readonly [] }
  | { matched: false; reasons: readonly MembershipNotVerifiedReason[] };

/**
 * A membership number matches a member in good standing. A card number
 * matches only if the card itself is `ACTIVE` and in date as well: a card
 * replaced, reported lost, or never handed over proves nothing about the
 * person holding it (the card's own rule, `isCardVerifiable`).
 */
export function decideMembershipVerification(
  facts: MembershipFacts,
): MembershipVerdict {
  if (facts.foundAs === null || facts.member === null) {
    return { matched: false, reasons: ['NO_RECORD'] };
  }

  const reasons = new Set<MembershipNotVerifiedReason>();
  if (!isMemberInGoodStanding(facts.member.status)) {
    reasons.add('MEMBER_NOT_ACTIVE');
  }
  if (facts.foundAs === 'CARD_NUMBER') {
    if (!facts.card || !isCardVerifiable(facts.card.status)) {
      reasons.add('CARD_NOT_ACTIVE');
    }
    if (facts.card?.expiryDate && facts.card.expiryDate <= facts.now) {
      reasons.add('CARD_EXPIRED');
    }
  }

  if (reasons.size === 0) {
    return { matched: true, reasons: [] };
  }
  return {
    matched: false,
    reasons: MEMBERSHIP_NOT_VERIFIED_REASONS.filter((reason) =>
      reasons.has(reason),
    ),
  };
}

/** PRD Requirement 11.1 — the exact matter verified. */
export const MEMBERSHIP_MATCH_STATEMENT =
  'A matching NURTW membership record was found under the requested verification criteria.';

/**
 * PRD §22 — a Union record does not establish a person's legal identity
 * beyond what the Union has collected and approved.
 */
export const MEMBERSHIP_LIMITATION =
  'A match confirms only that an NURTW membership record exists under the criteria checked. It does not establish identity beyond what the Union has recorded.';
