/**
 * Internal verification (PRD §11, item 10).
 *
 * The internal channels — the dashboard and the officer portal — answer with
 * every state behind a verdict. The external API (item 12) shares the verdict
 * rule and the projection function, never this response shape: an outside
 * caller receives the generic negative whatever the reasons are (ARCHITECTURE.md
 * Decision 5.4), and never dues (Requirement 27.8).
 */

import {
  isValidIdentifier,
  tryNormalizePlateNumber,
  type DisclosedReason,
  type MembershipLookup,
  type MembershipNotVerifiedReason,
  type ProjectedVerification,
  type VerificationCriteria,
} from '@nurtw/domain';
import { z } from 'zod';

import type { MemberDues, VehicleDues } from './payments.js';

/**
 * `POST /verifications`. A plate, a sticker code, or both; which ones are
 * present decides the check. Sent as a body so neither ends up in a URL or an
 * access log (Requirement 12.3).
 *
 * The sticker code is whatever the sticker's code holds: a signed QR payload,
 * or the number on a Transpay sticker.
 */
export const verifySchema = z
  .object({
    plateNumber: z
      .string()
      .trim()
      .max(20, 'A plate number may not exceed 20 characters.')
      .refine(
        (value) => tryNormalizePlateNumber(value).ok,
        'Enter a plate number of 3 to 16 letters and digits.',
      )
      .optional(),
    stickerCode: z
      .string()
      .trim()
      .min(1, 'A sticker code is required.')
      .max(128, 'A sticker code may not exceed 128 characters.')
      .optional(),
  })
  .refine((value) => value.plateNumber || value.stickerCode, {
    message: 'Enter a plate number, a sticker code, or both.',
  });
export type VerifyInput = z.infer<typeof verifySchema>;

/** The dues beside a verification, each within the officer's own scope. */
export interface VerificationDues {
  /** The vehicle's levy; `null` without `vehicle.read` over the vehicle. */
  vehicle: VehicleDues | null;
  /** The member's fee; `null` with no member, or without `member.read` over them. */
  member: MemberDues | null;
}

/** `POST /verifications` — what an internal channel is told. */
export interface InternalVerification {
  /** The request id, under which the check is recorded in the audit trail. */
  reference: string;
  verifiedAt: string;
  criteria: VerificationCriteria;
  matched: boolean;
  /**
   * Empty when matched; otherwise every reason, the headline first. Before a
   * caller without `vehicle.declare` over the vehicle, `NOT_DECLARED` reads
   * `RECORD_INCOMPLETE` (VEH-28).
   */
  reasons: readonly DisclosedReason[];
  /** Requirement 11.1 — the exact matter verified. */
  statement: string;
  /** PRD §22 — what a match does not establish. */
  limitation: string;
  /** The record, through the single projection function (Decision 5.3). */
  fields: ProjectedVerification;
  /**
   * Beside the verdict, never part of it (Requirement 27.8, PAY-05). Dues
   * never change whether a vehicle verifies.
   */
  dues: VerificationDues;
}

/**
 * `POST /verifications/membership` (item 24). The number printed on a card:
 * its card number or its membership number, which share one format. A
 * mistyped number fails its check character here, before any lookup.
 */
export const verifyMembershipSchema = z.object({
  number: z
    .string()
    .trim()
    .min(1, 'A card or membership number is required.')
    .max(32, 'A card or membership number may not exceed 32 characters.')
    .refine(
      isValidIdentifier,
      'Enter the number exactly as printed. This one fails its check character.',
    ),
});
export type VerifyMembershipInput = z.infer<typeof verifyMembershipSchema>;

/** `POST /verifications/membership` — what an internal channel is told. */
export interface InternalMembershipVerification {
  /** The request id, under which the check is recorded in the audit trail. */
  reference: string;
  verifiedAt: string;
  /** What the number turned out to be; `null` when it answered to nothing. */
  foundAs: MembershipLookup | null;
  matched: boolean;
  /** Empty when matched; otherwise every reason, the headline first. */
  reasons: readonly MembershipNotVerifiedReason[];
  statement: string;
  limitation: string;
  /** The record, through the single projection function (Decision 5.3). */
  fields: ProjectedVerification;
  /**
   * The member's fee, beside the verdict (Requirement 27.8); `null` without
   * `member.read` over the member.
   */
  dues: { member: MemberDues | null };
}
