/**
 * Vehicle sticker (PRD §10, §26, §9A — revision 1.2).
 *
 * A sticker may exist unattached (Requirement 10.3): issuing one and
 * attaching it are separate acts, separately permissioned (`sticker.issue`
 * vs `sticker.attach`). Attachment additionally requires a confirmed
 * payment reference — see `@nurtw/domain`'s `checkAttachment`, which this
 * schema's `attach` input feeds.
 */

import {
  isLegacyBarcode,
  stickerCodeFromScan,
  type StickerStockStanding,
} from '@nurtw/domain';
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
 * - `legacyBarcode` — a legacy barcode the Union holds: on the imported
 *   register (a reattachment), or in stock (Requirement 9A.8). What a camera
 *   read from the sticker may be sent as it is; the barcode is taken from it.
 *
 * A signed sticker and a legacy barcode are different rows with different
 * provenance, never interchangeable inputs to the same field.
 */
export const attachStickerSchema = z
  .object({
    stickerId: uuid.optional(),
    stickerQrId: z.string().trim().min(1).optional(),
    legacyBarcode: z
      .string()
      .trim()
      .min(1)
      .max(512)
      .transform(stickerCodeFromScan)
      .optional(),
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
 * An internal lookup of a scanned legacy barcode (Requirement 11.2). Sent in
 * a body, not a URL: a legacy barcode is the whole of what the sticker's code
 * carries, and a URL ends up in access logs.
 */
export const legacyBarcodeLookupSchema = z.object({
  barcode: z
    .string()
    .trim()
    .min(1, 'A barcode is required.')
    .max(512)
    .transform(stickerCodeFromScan),
});
export type LegacyBarcodeLookupInput = z.infer<typeof legacyBarcodeLookupSchema>;

/**
 * `POST /stickers/stock` — a printed legacy sticker taken into stock
 * (Requirement 9A.8, `QUESTIONS.md` VEH-29). `code` is what the camera read
 * from the sticker, or its number typed in. Only the shape is checked here:
 * a legacy barcode proves nothing by itself, which is why the permission to
 * add one is held so narrowly.
 */
export const addStickerStockSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Scan the sticker's code, or type its number.")
    .max(512)
    .transform(stickerCodeFromScan)
    .refine(isLegacyBarcode, "That is not a sticker's code."),
});
export type AddStickerStockInput = z.infer<typeof addStickerStockSchema>;

/**
 * `POST /stickers/stock/:id/withdrawal`. A reason is required: withdrawing
 * is final, and the audit trail says why (Requirement 18.1).
 */
export const withdrawStickerStockSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(4, 'Give a reason of at least 4 characters.')
    .max(1000, 'A reason may not exceed 1000 characters.'),
});
export type WithdrawStickerStockInput = z.infer<
  typeof withdrawStickerStockSchema
>;

/** One sticker taken into stock, as the stock screen shows it. */
export interface StickerStockEntry {
  id: string;
  /** The sticker's number: its barcode. */
  stickerNumber: string;
  standing: StickerStockStanding;
  addedAt: string;
  /** The officer who added it; `null` if that account has since gone. */
  addedBy: string | null;
  /** The plate it was attached to, once it has been. */
  attachedPlate: string | null;
  attachedAt: string | null;
}

/** `GET /stickers/stock` — the totals, and the latest entries. */
export interface StickerStockList {
  counts: { inStock: number; attached: number; withdrawn: number };
  stickers: StickerStockEntry[];
  /** True when more match than are listed; search to narrow them. */
  truncated: boolean;
}

/**
 * What adding a sticker did. `ALREADY_HELD` is not an error: the sticker is
 * on the register or in stock already, and `held` says where it stands.
 */
export type StickerStockAddition =
  | { outcome: 'ADDED'; sticker: StickerStockEntry }
  | {
      outcome: 'ALREADY_HELD';
      held: 'ON_REGISTER' | StickerStockStanding;
      /** Its stock entry, so it can be withdrawn; `null` for a register one. */
      sticker: StickerStockEntry | null;
    };

/**
 * `POST /stickers/onboarding/:vehicleId/reading` — what a scanned sticker
 * can be for this vehicle, asked before attaching it (Requirement 9A.7).
 *
 * An attachment that is refused answers a generic 409 and keeps its reason
 * in the audit trail. This says the same thing beforehand, to the officer
 * about to attach, and no more than they need: a sticker recorded for
 * another vehicle is said to be so, without naming that vehicle.
 */
export const stickerReadingSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Scan the sticker's code, or type its number.")
    .max(512)
    .transform(stickerCodeFromScan),
});
export type StickerReadingInput = z.infer<typeof stickerReadingSchema>;

export type StickerReading =
  | {
      result: 'CAN_ATTACH';
      stickerNumber: string;
      /** The fee this sticker must have been paid with for this vehicle. */
      feeTypeCode: string;
    }
  /** Neither on the register nor in stock. */
  | { result: 'NOT_HELD' }
  /** On the register for a different plate (VEH-16: no override). */
  | { result: 'FOR_ANOTHER_VEHICLE' }
  | { result: 'ALREADY_ATTACHED' }
  /** Withdrawn from stock, lost, or damaged. */
  | { result: 'NOT_AVAILABLE' };

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
 * `registerHoldsBarcodeForPlate` says whether the legacy register has an
 * unattached barcode for this plate, never which one: the barcode must come
 * from the sticker on the vehicle, or a reattachment would no longer prove
 * the sticker was there. `stockHasStickers` says whether stock holds any
 * sticker that can still be attached, never how many or which.
 */
export interface OnboardingState {
  vehicleId: string;
  hasRouteType: boolean;
  attachment:
    | (VehicleOnboarding & { stickerNumber: string })
    | null;
  registerHoldsBarcodeForPlate: boolean;
  stockHasStickers: boolean;
  eligiblePayments: EligibleOnboardingPayment[];
}

/**
 * `POST /vehicles/:id/letter/reissue` (`QUESTIONS.md` VEH-27 — item 26). A
 * reason is required: a reissue replaces a document someone carries, and the
 * audit trail says why (Requirement 18.1).
 */
export const reissueVehicleLetterSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(4, 'Give a reason of at least 4 characters.')
    .max(1000, 'A reason may not exceed 1000 characters.'),
});
export type ReissueVehicleLetterInput = z.infer<
  typeof reissueVehicleLetterSchema
>;

export const setStickerStatusSchema = z.object({
  status: z.enum(['SUSPENDED', 'ACTIVE', 'LOST', 'DAMAGED', 'CANCELLED']),
  reason: z.string().trim().min(1, 'A reason is required.'),
});
export type SetStickerStatusInput = z.infer<typeof setStickerStatusSchema>;
