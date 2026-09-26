/**
 * The attachment gate (PRD Requirement 9A.4, `QUESTIONS.md` VEH-13–21).
 *
 * A pure function so item 08's service and item 17's onboarding
 * orchestration can both call the exact same rule rather than each
 * re-deriving it. All four conditions must hold, with no override
 * (Requirement 9A.4 / VEH-16); each refusal names which one failed, so the
 * caller can audit the specific reason.
 *
 * The fourth condition, a confirmed and unused payment, is read with
 * Requirement 9A.2: the payment must be the onboarding fee, paid for this
 * vehicle. Item 08 checked only that it was confirmed and unused, so any
 * confirmed payment could fund an attachment — a membership fee, or a levy
 * paid for another vehicle. Found and closed in item 17.
 *
 * A barcode with no register row at all never reaches this function (there
 * is no sticker to pass in); the caller refuses it as `UNKNOWN_BARCODE` itself.
 */

/**
 * Every reason an attachment can be refused. `checkAttachment` produces most
 * of them; three are decided before it can run, by the caller, because the
 * row it would need is missing: `UNKNOWN_BARCODE` (no register row),
 * `PAYMENT_NOT_CONFIRMED` (no confirmed payment), and
 * `VEHICLE_ALREADY_HAS_STICKER` (replacing one is `sticker.replace`'s act).
 */
export type AttachmentRefusalReason =
  | 'UNKNOWN_BARCODE'
  | 'PLATE_MISMATCH'
  | 'ALREADY_ATTACHED'
  | 'PAYMENT_REFERENCE_REUSED'
  | 'PAYMENT_NOT_CONFIRMED'
  | 'PAYMENT_WRONG_FEE_TYPE'
  | 'PAYMENT_WRONG_VEHICLE'
  | 'VEHICLE_ALREADY_HAS_STICKER';

/**
 * The onboarding fee each kind of attachment must be paid with (Requirement
 * 9A.2, `QUESTIONS.md` VEH-20). Two fee types, even while they cost the same,
 * so either can be re-priced without a deploy.
 */
export const ONBOARDING_FEE_TYPE_CODES = {
  legacy: 'STICKER_REATTACHMENT',
  signed: 'STICKER_NEW',
} as const;

export function requiredOnboardingFeeType(
  isLegacyBarcode: boolean,
): (typeof ONBOARDING_FEE_TYPE_CODES)[keyof typeof ONBOARDING_FEE_TYPE_CODES] {
  return isLegacyBarcode
    ? ONBOARDING_FEE_TYPE_CODES.legacy
    : ONBOARDING_FEE_TYPE_CODES.signed;
}

export interface AttachmentContext {
  /**
   * Whether this sticker carries a legacy Transpay barcode. `false` for a
   * freshly signed sticker, which skips the register/plate checks entirely
   * — those exist only because a legacy barcode is forgeable by inspection
   * (CLAUDE.md); a newly minted, HMAC-signed identifier is not.
   */
  isLegacyBarcode: boolean;
  /**
   * The plate the imported Transpay register binds this barcode to, or
   * `null` if the barcode is not on the register at all — recorded as
   * unknown, never as a forgery, since NURTW holds a few printed stickers
   * with no digital record (VEH-15). Ignored when `isLegacyBarcode` is
   * `false`.
   */
  registeredPlateNormalized: string | null;
  /** The plate the sticker is being attached to now. */
  targetPlateNormalized: string;
  /** `null` if this sticker has never been attached before. One-shot. */
  previouslyAttachedAt: Date | null;
  /** Whether the accompanying Paystack payment reference has been used before. */
  paymentReferenceAlreadyUsed: boolean;
  /**
   * The fee type the payment was made for. A reattachment must be paid as
   * `STICKER_REATTACHMENT`, a new sticker as `STICKER_NEW`: a membership fee
   * or a levy is not an onboarding payment (Requirement 9A.2).
   */
  paymentFeeTypeCode: string;
  /** What the payment was made for, as recorded on it at initiation. */
  paymentSubject: { type: string; id: string };
  /** The vehicle being onboarded. The payment must have been made for it. */
  targetVehicleId: string;
}

export type AttachmentCheck =
  | { allowed: true }
  | { allowed: false; reason: AttachmentRefusalReason };

export function checkAttachment(context: AttachmentContext): AttachmentCheck {
  if (context.previouslyAttachedAt !== null) {
    return { allowed: false, reason: 'ALREADY_ATTACHED' };
  }
  if (context.paymentReferenceAlreadyUsed) {
    return { allowed: false, reason: 'PAYMENT_REFERENCE_REUSED' };
  }
  if (
    context.paymentFeeTypeCode !==
    requiredOnboardingFeeType(context.isLegacyBarcode)
  ) {
    return { allowed: false, reason: 'PAYMENT_WRONG_FEE_TYPE' };
  }
  if (
    context.paymentSubject.type !== 'vehicle' ||
    context.paymentSubject.id !== context.targetVehicleId
  ) {
    return { allowed: false, reason: 'PAYMENT_WRONG_VEHICLE' };
  }
  if (context.isLegacyBarcode) {
    if (context.registeredPlateNormalized === null) {
      return { allowed: false, reason: 'UNKNOWN_BARCODE' };
    }
    if (context.registeredPlateNormalized !== context.targetPlateNormalized) {
      return { allowed: false, reason: 'PLATE_MISMATCH' };
    }
  }
  return { allowed: true };
}
