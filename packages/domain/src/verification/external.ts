/**
 * The external verification channel (PRD §12, proposal §12.3 — item 12).
 *
 * The verdict is `decideVerification` or `decideMembershipVerification`, the
 * rule the internal channels apply. What differs is the answer. An outside
 * organisation is told MATCH_FOUND or NO_MATCH_FOUND, never why
 * (ARCHITECTURE.md Decision 5.4), and a match carries only the fields this
 * check may carry *and* its disclosure profile permits.
 */

import {
  MEMBERSHIP_LIMITATION,
  MEMBERSHIP_MATCH_STATEMENT,
} from './membership.js';
import type { ExternalVerificationField } from './projection.js';
import {
  MATCH_STATEMENTS,
  NO_MATCH_STATEMENT,
  VERIFICATION_LIMITATION,
} from './verdict.js';

/** The four checks of proposal §12.3. */
export const EXTERNAL_CHECKS = [
  'PLATE',
  'STICKER',
  'COMBINED',
  'MEMBERSHIP',
] as const;
export type ExternalCheck = (typeof EXTERNAL_CHECKS)[number];

export const EXTERNAL_RESULTS = ['MATCH_FOUND', 'NO_MATCH_FOUND'] as const;
export type ExternalResult = (typeof EXTERNAL_RESULTS)[number];

/**
 * What each check may carry before the profile narrows it.
 *
 * Proposal §10.2 lists what a sticker check may say: the sticker's status,
 * whether it belongs to a presented plate, the vehicle category, the branch or
 * unit, and the issue date. Not the plate: a sticker check must not become a
 * way to learn which vehicle a sticker is on. A membership check says nothing
 * of vehicles, and a vehicle check nothing of members.
 */
export const EXTERNAL_CHECK_FIELDS: Readonly<
  Record<ExternalCheck, readonly ExternalVerificationField[]>
> = {
  PLATE: [
    'plate_number',
    'vehicle_category',
    'sticker_status',
    'organizational_unit',
    'attached_at',
  ],
  STICKER: [
    'vehicle_category',
    'sticker_status',
    'organizational_unit',
    'attached_at',
  ],
  COMBINED: [
    'plate_number',
    'vehicle_category',
    'sticker_status',
    'organizational_unit',
    'attached_at',
    'plate_matches_sticker',
  ],
  MEMBERSHIP: [
    'membership_status',
    'card_status',
    'designation',
    'organizational_unit',
  ],
};

/**
 * The record a match names. PRD Requirement 12.7: `NURTW_VEHICLE`, never
 * `NURTW_DECLARED_VEHICLE`.
 */
export const EXTERNAL_RECORD_TYPES: Readonly<Record<ExternalCheck, string>> = {
  PLATE: 'NURTW_VEHICLE',
  STICKER: 'NURTW_STICKER',
  COMBINED: 'NURTW_VEHICLE',
  MEMBERSHIP: 'NURTW_MEMBERSHIP',
};

/**
 * The fields to project for a match: those the check may carry that the
 * profile also permits. The result goes to `projectVerification` on the
 * `EXTERNAL` channel, which drops anything internal-only regardless.
 */
export function externalCheckFields(
  check: ExternalCheck,
  profileFields: Iterable<string>,
): ExternalVerificationField[] {
  const permitted = new Set(profileFields);
  return EXTERNAL_CHECK_FIELDS[check].filter((field) => permitted.has(field));
}

/** PRD Requirement 11.1 and §22 — the exact matter verified. */
export function externalStatement(
  check: ExternalCheck,
  matched: boolean,
): string {
  if (!matched) {
    return NO_MATCH_STATEMENT;
  }
  return check === 'MEMBERSHIP'
    ? MEMBERSHIP_MATCH_STATEMENT
    : MATCH_STATEMENTS[check];
}

/** PRD §22 — what a match does not establish. The same on every answer. */
export function externalLimitation(check: ExternalCheck): string {
  return check === 'MEMBERSHIP'
    ? MEMBERSHIP_LIMITATION
    : VERIFICATION_LIMITATION;
}
