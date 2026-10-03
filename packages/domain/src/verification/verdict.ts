/**
 * The verification verdict (PRD §11, §26.3, Requirement 9A.1 — item 10).
 *
 * One rule for every channel. `QUESTIONS.md` VEH-22 settled that the external
 * API and the public page match only a vehicle that is both onboarded and
 * declared; the internal channels apply the same rule to their headline, so an
 * officer never sees VERIFIED for a vehicle an outside organisation would be
 * told is not found. What the internal channels add is the *reasons*: every
 * state behind a negative verdict. An external caller receives the generic
 * negative whatever the reasons are (ARCHITECTURE.md Decision 5.4).
 */

import { isStickerVerifiable, type StickerStatus } from '../sticker/status.js';
import {
  isDeclarationLive,
  type DeclarationStatus,
} from '../vehicle/status.js';

/** What was presented: a plate, a sticker code, or both together. */
export const VERIFICATION_CRITERIA = ['PLATE', 'STICKER', 'COMBINED'] as const;
export type VerificationCriteria = (typeof VERIFICATION_CRITERIA)[number];

/**
 * Why a verification did not match, most decisive first. The order is the
 * order a reason is reported in, so the first one is the headline.
 */
export const NOT_VERIFIED_REASONS = [
  /** A signed code failed its signature, or was malformed (Requirement 26.1). */
  'INVALID_CODE',
  /** Nothing is on record for what was presented. */
  'NO_RECORD',
  /** Combined: the sticker belongs to another plate. */
  'PLATE_MISMATCH',
  /** The sticker exists but has never been attached (Requirement 10.3). */
  'STICKER_NOT_ATTACHED',
  /** Attached, but suspended, lost, replaced, damaged, expired, or cancelled. */
  'STICKER_NOT_ACTIVE',
  /** The vehicle has no ACTIVE declaration: on record only, suspended, … */
  'NOT_DECLARED',
  /** No sticker has ever been attached to the vehicle (Decision 6.5). */
  'NOT_ONBOARDED',
] as const;
export type NotVerifiedReason = (typeof NOT_VERIFIED_REASONS)[number];

/** The facts about a vehicle the verdict needs, and nothing else. */
export interface VerificationVehicle {
  declarationStatus: DeclarationStatus;
  plateNumberNormalized: string;
  /**
   * ARCHITECTURE.md Decision 6.5 — onboarded when a sticker has been attached
   * to it at some point. A sticker later reported lost does not undo that.
   */
  onboarded: boolean;
}

/** The facts about a sticker the verdict needs, and nothing else. */
export interface VerificationSticker {
  status: StickerStatus;
  attached: boolean;
  /**
   * A legacy barcode only: the plate the Transpay register binds it to
   * (Requirement 9A.3). `null` for a signed sticker.
   */
  registeredPlateNormalized: string | null;
}

/**
 * For a sticker or combined check, `vehicle` is the vehicle the sticker is
 * attached to, `null` when it is attached to none. The presented plate is
 * compared with it, never looked up separately.
 */
export type VerificationFacts =
  | { criteria: 'PLATE'; vehicle: VerificationVehicle | null }
  | {
      criteria: 'STICKER';
      /** False when a signed code failed its signature. */
      codeValid: boolean;
      sticker: VerificationSticker | null;
      vehicle: VerificationVehicle | null;
    }
  | {
      criteria: 'COMBINED';
      codeValid: boolean;
      /** Normalised. */
      presentedPlate: string;
      sticker: VerificationSticker | null;
      vehicle: VerificationVehicle | null;
    };

export type VerificationVerdict =
  | { matched: true; reasons: readonly [] }
  | { matched: false; reasons: readonly NotVerifiedReason[] };

export function decideVerification(
  facts: VerificationFacts,
): VerificationVerdict {
  const reasons = new Set<NotVerifiedReason>();

  if (facts.criteria === 'PLATE') {
    if (!facts.vehicle) {
      reasons.add('NO_RECORD');
    } else {
      if (!isDeclarationLive(facts.vehicle.declarationStatus)) {
        reasons.add('NOT_DECLARED');
      }
      if (!facts.vehicle.onboarded) {
        reasons.add('NOT_ONBOARDED');
      }
    }
    return verdict(reasons);
  }

  // A code that failed its signature proves nothing about any record, so it
  // is the only reason given: nothing was looked up (Decision 6.2.1).
  if (!facts.codeValid) {
    return verdict(new Set(['INVALID_CODE']));
  }
  if (!facts.sticker) {
    return verdict(new Set(['NO_RECORD']));
  }

  const { sticker, vehicle } = facts;
  if (!sticker.attached || !vehicle) {
    reasons.add('STICKER_NOT_ATTACHED');
    // An unattached Transpay barcode still names a plate on the register, so a
    // copy presented on another vehicle is caught before it is ever attached
    // (Requirement 11.2).
    if (
      facts.criteria === 'COMBINED' &&
      sticker.registeredPlateNormalized !== null &&
      sticker.registeredPlateNormalized !== facts.presentedPlate
    ) {
      reasons.add('PLATE_MISMATCH');
    }
    return verdict(reasons);
  }

  if (
    facts.criteria === 'COMBINED' &&
    vehicle.plateNumberNormalized !== facts.presentedPlate
  ) {
    reasons.add('PLATE_MISMATCH');
  }
  if (!isStickerVerifiable(sticker.status)) {
    reasons.add('STICKER_NOT_ACTIVE');
  }
  if (!isDeclarationLive(vehicle.declarationStatus)) {
    reasons.add('NOT_DECLARED');
  }
  return verdict(reasons);
}

function verdict(reasons: ReadonlySet<NotVerifiedReason>): VerificationVerdict {
  if (reasons.size === 0) {
    return { matched: true, reasons: [] };
  }
  return {
    matched: false,
    reasons: NOT_VERIFIED_REASONS.filter((reason) => reasons.has(reason)),
  };
}

/**
 * A reason as an internal channel may state it. `RECORD_INCOMPLETE` stands in
 * for `NOT_DECLARED` before anyone who may not see declaration status.
 */
export type DisclosedReason = NotVerifiedReason | 'RECORD_INCOMPLETE';

/**
 * `QUESTIONS.md` VEH-28 — a vehicle's declaration status is shown only to
 * holders of `vehicle.declare`. For anyone else, `NOT_DECLARED` becomes
 * `RECORD_INCOMPLETE`, in the same place in the order. The officer learns the
 * record is not complete, never that the vehicle is undeclared. The verdict
 * itself is unchanged, and the audit trail keeps the true reasons.
 */
export function discloseReasons(
  reasons: readonly NotVerifiedReason[],
  declarationVisible: boolean,
): DisclosedReason[] {
  return declarationVisible
    ? [...reasons]
    : reasons.map((reason) =>
        reason === 'NOT_DECLARED' ? 'RECORD_INCOMPLETE' : reason,
      );
}

/**
 * PRD Requirement 11.1 and §22 — a result states exactly what was verified.
 * A match never claims ownership, roadworthiness, licensing, or insurance.
 */
export const MATCH_STATEMENTS: Readonly<Record<VerificationCriteria, string>> =
  {
    PLATE:
      'A matching NURTW vehicle record was found under the requested verification criteria.',
    STICKER:
      'A matching NURTW sticker record was found under the requested verification criteria.',
    COMBINED:
      'A matching NURTW vehicle and sticker record was found under the requested verification criteria.',
  };

export const NO_MATCH_STATEMENT =
  'No matching NURTW record was found under the requested verification criteria.';

/** PRD §22 — what a match does not establish. Shown with every result. */
export const VERIFICATION_LIMITATION =
  'A match confirms only that an NURTW record exists under the criteria checked. It is not evidence of ownership, roadworthiness, licensing, or insurance.';
