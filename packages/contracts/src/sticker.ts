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
 * Attaches a sticker — either the one named by `stickerId` (a freshly
 * issued sticker) or the legacy barcode named by `legacyBarcode` (a
 * reattachment) — to the vehicle named by `vehicleId`, funded by the
 * confirmed payment `paymentId`. Exactly one of `stickerId`/`legacyBarcode`
 * is required: the two are different sticker rows with different
 * provenance, never interchangeable inputs to the same field.
 */
export const attachStickerSchema = z
  .object({
    stickerId: uuid.optional(),
    legacyBarcode: z.string().trim().min(1).optional(),
    vehicleId: uuid,
    paymentId: uuid,
  })
  .refine(
    (value) => Boolean(value.stickerId) !== Boolean(value.legacyBarcode),
    {
      message: 'Supply exactly one of stickerId or legacyBarcode.',
    },
  );
export type AttachStickerInput = z.infer<typeof attachStickerSchema>;

export const setStickerStatusSchema = z.object({
  status: z.enum(['SUSPENDED', 'ACTIVE', 'LOST', 'DAMAGED', 'CANCELLED']),
  reason: z.string().trim().min(1, 'A reason is required.'),
});
export type SetStickerStatusInput = z.infer<typeof setStickerStatusSchema>;
