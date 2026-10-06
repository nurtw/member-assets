/**
 * What an internal channel says about a scanned legacy barcode (PRD
 * Requirement 11.2, `QUESTIONS.md` VEH-17; stock added by revision 1.12,
 * VEH-29).
 *
 * Internal only. The external API and the public page answer the generic
 * not-found for every legacy barcode that is not attached, because telling an
 * outside party that a barcode is held would let it enumerate the register
 * (CLAUDE.md rule 7).
 *
 * The copy never says "genuine". The System can confirm a barcode is held,
 * and which plate the register recorded it for, not that the article in the
 * officer's hand is authentic: a copy scans identically (VEH-14). The
 * registered plate is shown so the officer can catch a copy on the wrong
 * vehicle. The copy also never says where a sticker came from: a sticker is
 * a sticker.
 */

export const RECOGNISED_NOT_ATTACHED_COPY =
  'Recognised sticker — not attached';

export const LEGACY_ATTACHED_COPY =
  'Sticker — attached through the System';

export const IN_STOCK_COPY = 'Recognised sticker — in stock, not attached';

export const WITHDRAWN_COPY = 'Sticker withdrawn — it cannot be attached';

/** A held barcode's row, as the lookup reads it. */
export interface LegacyRegisterEntry {
  /** The plate the imported register binds the barcode to. */
  registeredPlateNormalized: string | null;
  /** When it was taken into stock by scanning; `null` for an imported one. */
  stockAddedAt: Date | null;
  attachedAt: Date | null;
  /** The plate recorded at attachment; `null` until attached. */
  plateNumberAtIssue: string | null;
  vehicleId: string | null;
  status: string;
}

export type LegacyBarcodeReading =
  | {
      result: 'RECOGNISED_NOT_ATTACHED';
      message: typeof RECOGNISED_NOT_ATTACHED_COPY;
      registeredPlate: string;
    }
  | {
      /** In stock: bound to no plate until it is attached. */
      result: 'IN_STOCK';
      message: typeof IN_STOCK_COPY;
    }
  | {
      /** Withdrawn from stock, lost, or damaged before it was attached. */
      result: 'WITHDRAWN';
      message: typeof WITHDRAWN_COPY;
    }
  | {
      result: 'ATTACHED';
      message: typeof LEGACY_ATTACHED_COPY;
      attachedPlate: string;
      vehicleId: string;
      stickerStatus: string;
    };

/** Whether a row is a barcode the Union holds: on the register, or in stock. */
export function isHeldBarcode(entry: {
  registeredPlateNormalized: string | null;
  stockAddedAt: Date | null;
}): boolean {
  return entry.registeredPlateNormalized !== null || entry.stockAddedAt !== null;
}

/**
 * `null` when the barcode is not held: no row at all, or a row that is
 * neither on the register nor in stock (no route writes one, so it would be a
 * defect, and is treated as unknown rather than guessed at). The caller
 * answers that with the generic not-found.
 */
export function describeLegacyBarcode(
  entry: LegacyRegisterEntry | null,
): LegacyBarcodeReading | null {
  if (!entry || !isHeldBarcode(entry)) {
    return null;
  }
  if (
    entry.attachedAt !== null &&
    entry.vehicleId !== null &&
    entry.plateNumberAtIssue !== null
  ) {
    return {
      result: 'ATTACHED',
      message: LEGACY_ATTACHED_COPY,
      attachedPlate: entry.plateNumberAtIssue,
      vehicleId: entry.vehicleId,
      stickerStatus: entry.status,
    };
  }
  if (entry.status !== 'ISSUED') {
    return { result: 'WITHDRAWN', message: WITHDRAWN_COPY };
  }
  if (entry.registeredPlateNormalized !== null) {
    return {
      result: 'RECOGNISED_NOT_ATTACHED',
      message: RECOGNISED_NOT_ATTACHED_COPY,
      registeredPlate: entry.registeredPlateNormalized,
    };
  }
  return { result: 'IN_STOCK', message: IN_STOCK_COPY };
}

/**
 * Where a stock sticker stands (Requirement 9A.8). Worked out from the row,
 * never stored, as an invitation's standing is.
 */
export type StickerStockStanding = 'IN_STOCK' | 'ATTACHED' | 'WITHDRAWN';

export function stickerStockStanding(sticker: {
  attachedAt: Date | null;
  status: string;
}): StickerStockStanding {
  if (sticker.attachedAt !== null) {
    return 'ATTACHED';
  }
  return sticker.status === 'ISSUED' ? 'IN_STOCK' : 'WITHDRAWN';
}
