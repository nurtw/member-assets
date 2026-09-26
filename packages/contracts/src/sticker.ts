/**
 * Vehicle sticker (PRD §10, §26, §9A — revision 1.2).
 *
 * A sticker may exist unattached (Requirement 10.3): issuing one and
 * attaching it are separate acts, separately permissioned (`sticker.issue`
 * vs `sticker.attach`). Attachment additionally requires a confirmed
 * payment reference — see `@nurtw/domain`'s `checkAttachment`, which this
 * schema's `attach` input feeds.
 */

import { z } from 'zod';

const uuid = z.uuid('A valid identifier is required.');

/**
 * Issues a fresh, unattached, signed sticker (no legacy barcode). Never
 * accepts a plate — a sticker is bound to a plate only at attachment
 * (Requirement 9A.2, "new sticker" path).
 */
export const issueStickerSchema = z.object({
  templateVersion: z.string().trim().min(1),
});
export type IssueStickerInput = z.infer<typeof issueStickerSchema>;

/**
 * Attaches a sticker to the vehicle named by `vehicleId`, funded by the
 * confirmed payment `paymentId`. The sticker is named by exactly one of:
 *
 * - `stickerId` — a freshly issued sticker, by its record id;
 * - `stickerQrId` — the same, by the number printed on it (item 17: an
 *   officer holds the printed article, not its database id);
 * - `legacyBarcode` — a Transpay barcode on the imported register (a
 *   reattachment).
 *
 * A signed sticker and a legacy barcode are different rows with different
 * provenance, never interchangeable inputs to the same field.
 */
export const attachStickerSchema = z
  .object({
    stickerId: uuid.optional(),
    stickerQrId: z.string().trim().min(1).optional(),
    legacyBarcode: z.string().trim().min(1).optional(),
    vehicleId: uuid,
    paymentId: uuid,
  })
  .refine(
    (value) =>
      [value.stickerId, value.stickerQrId, value.legacyBarcode].filter(Boolean)
        .length === 1,
    {
      message: 'Supply exactly one of stickerId, stickerQrId, or legacyBarcode.',
    },
  );
export type AttachStickerInput = z.infer<typeof attachStickerSchema>;

/**
 * An internal lookup of a scanned Transpay barcode (Requirement 11.2). Sent in
 * a body, not a URL: a legacy barcode is the whole of what the sticker's code
 * carries, and a URL ends up in access logs.
 */
export const legacyBarcodeLookupSchema = z.object({
  barcode: z.string().trim().min(1, 'A barcode is required.').max(64),
});
export type LegacyBarcodeLookupInput = z.infer<typeof legacyBarcodeLookupSchema>;

/**
 * How a vehicle was onboarded (Requirement 9A.1, Decision 6.5): derived from
 * its attached sticker, never stored on the vehicle. The sticker number is
 * deliberately absent here; it appears only in `OnboardingState`, which needs
 * `sticker.attach`.
 */
export interface VehicleOnboarding {
  kind: 'LEGACY' | 'SIGNED';
  attachedAt: string;
  /** The attaching officer's name; `null` if that account has since gone. */
  attachedBy: string | null;
  stickerStatus: string;
  /**
   * The vehicle letter's reference (Requirement 9A.6, item 18). `null` only for
   * an attachment made before item 18, which produced no letter.
   */
  letterReference: string | null;
}

/** A confirmed onboarding payment for this vehicle, not yet used. */
export interface EligibleOnboardingPayment {
  id: string;
  feeTypeCode: string;
  feeTypeLabel: string;
  totalChargedKobo: number;
  paystackReference: string;
  confirmedAt: string | null;
}

/**
 * `GET /stickers/onboarding/:vehicleId` — what the onboarding screen needs.
 * `registerHoldsBarcodeForPlate` says whether the Transpay register has an
 * unattached barcode for this plate, never which one: the barcode must come
 * from the sticker on the vehicle, or a reattachment would no longer prove
 * the sticker was there.
 */
export interface OnboardingState {
  vehicleId: string;
  hasRouteType: boolean;
  attachment:
    | (VehicleOnboarding & { stickerNumber: string })
    | null;
  registerHoldsBarcodeForPlate: boolean;
  eligiblePayments: EligibleOnboardingPayment[];
}

export const setStickerStatusSchema = z.object({
  status: z.enum(['SUSPENDED', 'ACTIVE', 'LOST', 'DAMAGED', 'CANCELLED']),
  reason: z.string().trim().min(1, 'A reason is required.'),
});
export type SetStickerStatusInput = z.infer<typeof setStickerStatusSchema>;
