/**
 * The attachment gate (PRD Requirement 9A.4, `QUESTIONS.md` VEH-13–21).
 *
 * A pure function so item 08's service and item 17's onboarding
 * orchestration can both call the exact same rule rather than each
 * re-deriving it. All four conditions must hold, with no override
 * (Requirement 9A.4 / VEH-16); each refusal names which one failed, so the
 * caller can audit the specific reason.
 */

export type AttachmentRefusalReason =
  | 'UNKNOWN_BARCODE'
  | 'PLATE_MISMATCH'
  | 'ALREADY_ATTACHED'
  | 'PAYMENT_REFERENCE_REUSED';

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
