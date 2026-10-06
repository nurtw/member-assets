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
  type ExternalResult,
  type MembershipLookup,
  type MembershipNotVerifiedReason,
  type ProjectedVerification,
  type VerificationCriteria,
} from '@nurtw/domain';
import { z } from 'zod';

import type { MemberDues, VehicleDues } from './payments.js';

/**
 * The fields every channel validates the same way, so an internal check and an
 * external one refuse exactly the same input.
 */
const plateNumberField = z
  .string()
  .trim()
  .max(20, 'A plate number may not exceed 20 characters.')
  .refine(
    (value) => tryNormalizePlateNumber(value).ok,
    'Enter a plate number of 3 to 16 letters and digits.',
  );

/**
 * Whatever the sticker's code holds: a signed QR payload, or the number on a
 * legacy sticker.
 */
const stickerCodeField = z
  .string()
  .trim()
  .min(1, 'A sticker code is required.')
  .max(128, 'A sticker code may not exceed 128 characters.');

/**
 * A card number or a membership number, which share one format. A mistyped
 * number fails its check character here, before any lookup.
 */
const identifierNumberField = z
  .string()
  .trim()
  .min(1, 'A card or membership number is required.')
  .max(32, 'A card or membership number may not exceed 32 characters.')
  .refine(
    isValidIdentifier,
    'Enter the number exactly as printed. This one fails its check character.',
  );

/**
 * `POST /verifications`. A plate, a sticker code, or both; which ones are
 * present decides the check. Sent as a body so neither ends up in a URL or an
 * access log (Requirement 12.3).
 */
export const verifySchema = z
  .object({
    plateNumber: plateNumberField.optional(),
    stickerCode: stickerCodeField.optional(),
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
 * its card number or its membership number.
 */
export const verifyMembershipSchema = z.object({
  number: identifierNumberField,
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

// --- The external API (item 12) ---------------------------------------------

/**
 * Bodies of the external checks, in the names proposal §12.4 and §12.6 use.
 * Unknown keys are stripped. The values are validated exactly as the internal
 * checks validate them.
 */
export const externalPlateVerificationSchema = z.object({
  plate_number: plateNumberField,
});
export type ExternalPlateVerificationInput = z.infer<
  typeof externalPlateVerificationSchema
>;

export const externalStickerVerificationSchema = z.object({
  sticker_qr_id: stickerCodeField,
});
export type ExternalStickerVerificationInput = z.infer<
  typeof externalStickerVerificationSchema
>;

export const externalCombinedVerificationSchema = z.object({
  plate_number: plateNumberField,
  sticker_qr_id: stickerCodeField,
});
export type ExternalCombinedVerificationInput = z.infer<
  typeof externalCombinedVerificationSchema
>;

export const externalMembershipVerificationSchema = z.object({
  number: identifierNumberField,
});
export type ExternalMembershipVerificationInput = z.infer<
  typeof externalMembershipVerificationSchema
>;

/**
 * What an outside organisation is told (proposal §12.5, amended by PRD
 * Requirement 12.7).
 *
 * A non-match is `NO_MATCH_FOUND` with no record field, whatever the reason
 * (ARCHITECTURE.md Decision 5.4). A match names the record and carries the
 * fields its check may carry that the organisation's profile permits, by the
 * catalogue's names. No reason, no declaration, and no dues ever appear.
 */
export interface ExternalVerificationResponse extends ProjectedVerification {
  /** The `X-Request-ID` the organisation sent, or one the server minted. */
  request_id: string;
  result: ExternalResult;
  /** On a match only. */
  record_type?: string;
  /** PRD §22 — the exact matter verified. */
  statement: string;
  /** PRD §22 — what a match does not establish. */
  limitation: string;
  verified_at: string;
  data_as_of: string;
}
