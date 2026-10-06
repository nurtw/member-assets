/**
 * The attachment gate (PRD Requirement 9A.4, `QUESTIONS.md` VEH-13–21 and
 * VEH-29).
 *
 * A pure function so item 08's service and item 17's onboarding
 * orchestration can both call the exact same rule rather than each
 * re-deriving it. All four conditions must hold, with no override
 * (Requirement 9A.4 / VEH-16); each refusal names which one failed, so the
 * caller can audit the specific reason.
 *
 * Revision 1.12 (VEH-29) adds a second way for a legacy barcode to be held:
 * taken into stock by scanning (Requirement 9A.8). A stock barcode has no
 * plate until it is attached, so the plate check does not apply to it, and
 * it is paid for as a new sticker.
 *
 * The fourth condition, a confirmed and unused payment, is read with
 * Requirement 9A.2: the payment must be the onboarding fee, paid for this
 * vehicle. Item 08 checked only that it was confirmed and unused, so any
 * confirmed payment could fund an attachment — a membership fee, or a levy
 * paid for another vehicle. Found and closed in item 17.
 *
 * A barcode with no row at all never reaches this function (there is no
 * sticker to pass in); the caller refuses it as `UNKNOWN_BARCODE` itself.
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
  | 'STICKER_NOT_AVAILABLE'
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
  /** The sticker the vehicle already carries, recorded for its plate. */
  reattachment: 'STICKER_REATTACHMENT',
  /** A sticker the vehicle did not have: one from stock, or a signed one. */
  newSticker: 'STICKER_NEW',
} as const;

export type OnboardingFeeTypeCode =
  (typeof ONBOARDING_FEE_TYPE_CODES)[keyof typeof ONBOARDING_FEE_TYPE_CODES];

/**
 * Where a sticker came from, which decides the checks it passes and the fee
 * it is paid with:
 *
 * - `REGISTER`: a legacy barcode imported with the plate it was issued for.
 * - `STOCK`: a legacy barcode taken into stock by scanning, with no plate.
 * - `SIGNED`: a sticker the System minted.
 */
export type StickerOrigin = 'REGISTER' | 'STOCK' | 'SIGNED';

/**
 * `null` for a legacy barcode that is neither on the register nor in stock.
 * No route writes such a row, so it would be a defect, and is refused as
 * unknown rather than guessed at.
 */
export function stickerOrigin(sticker: {
  isLegacyBarcode: boolean;
  registeredPlateNormalized: string | null;
  inStock: boolean;
}): StickerOrigin | null {
  if (!sticker.isLegacyBarcode) {
    return 'SIGNED';
  }
  if (sticker.registeredPlateNormalized !== null) {
    return 'REGISTER';
  }
  return sticker.inStock ? 'STOCK' : null;
}

export function requiredOnboardingFeeType(
  origin: StickerOrigin,
): OnboardingFeeTypeCode {
  return origin === 'REGISTER'
    ? ONBOARDING_FEE_TYPE_CODES.reattachment
    : ONBOARDING_FEE_TYPE_CODES.newSticker;
}

export interface AttachmentContext {
  /**
   * Whether this sticker carries a legacy barcode. `false` for a
   * freshly signed sticker, which skips the register/plate checks entirely
   * — those exist only because a legacy barcode is forgeable by inspection
   * (CLAUDE.md); a newly minted, HMAC-signed identifier is not.
   */
  isLegacyBarcode: boolean;
  /**
   * The plate the imported legacy register binds this barcode to, or
   * `null` if the register does not hold it. Ignored when `isLegacyBarcode`
   * is `false`.
   */
  registeredPlateNormalized: string | null;
  /**
   * Whether this legacy barcode was taken into stock by scanning
   * (Requirement 9A.8). A stock barcode has no plate until it is attached.
   */
  inStock: boolean;
  /**
   * The sticker's status now. Only an `ISSUED` sticker can be attached: one
   * withdrawn from stock, lost, or damaged is no longer available.
   */
  stickerStatus: string;
  /** The plate the sticker is being attached to now. */
  targetPlateNormalized: string;
  /** `null` if this sticker has never been attached before. One-shot. */
  previouslyAttachedAt: Date | null;
  /** Whether the accompanying Paystack payment reference has been used before. */
  paymentReferenceAlreadyUsed: boolean;
  /**
   * The fee type the payment was made for. A reattachment must be paid as
   * `STICKER_REATTACHMENT`; a sticker from stock, or a signed one, as
   * `STICKER_NEW`. A membership fee or a levy is not an onboarding payment
   * (Requirement 9A.2).
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
  if (context.stickerStatus !== 'ISSUED') {
    return { allowed: false, reason: 'STICKER_NOT_AVAILABLE' };
  }
  if (context.paymentReferenceAlreadyUsed) {
    return { allowed: false, reason: 'PAYMENT_REFERENCE_REUSED' };
  }
  const origin = stickerOrigin(context);
  if (origin === null) {
    return { allowed: false, reason: 'UNKNOWN_BARCODE' };
  }
  if (context.paymentFeeTypeCode !== requiredOnboardingFeeType(origin)) {
    return { allowed: false, reason: 'PAYMENT_WRONG_FEE_TYPE' };
  }
  if (
    context.paymentSubject.type !== 'vehicle' ||
    context.paymentSubject.id !== context.targetVehicleId
  ) {
    return { allowed: false, reason: 'PAYMENT_WRONG_VEHICLE' };
  }
  // Only a register barcode carries a plate to be held to (VEH-16). A stock
  // barcode is bound to its plate by this attachment.
  if (
    origin === 'REGISTER' &&
    context.registeredPlateNormalized !== context.targetPlateNormalized
  ) {
    return { allowed: false, reason: 'PLATE_MISMATCH' };
  }
  return { allowed: true };
}
