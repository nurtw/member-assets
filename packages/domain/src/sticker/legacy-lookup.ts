/**
 * What an internal channel says about a scanned legacy Transpay barcode (PRD
 * Requirement 11.2, `QUESTIONS.md` VEH-17).
 *
 * Internal only. The external API and the public page answer the generic
 * not-found for every legacy barcode that is not attached, because telling an
 * outside party that a barcode is on the register would let it enumerate the
 * register (CLAUDE.md rule 7).
 *
 * The copy never says "genuine". The System can confirm a barcode is on the
 * register and which plate it was issued for, not that the article in the
 * officer's hand is authentic: a copy scans identically (VEH-14). The
 * registered plate is shown so the officer can catch a copy on the wrong
 * vehicle.
 */

export const RECOGNISED_NOT_ATTACHED_COPY =
  'Recognised Transpay sticker — not attached';

export const TRANSPAY_ATTACHED_COPY =
  'Transpay sticker — attached through the System';

/** A register row, as the lookup reads it. */
export interface LegacyRegisterEntry {
  /** The plate the imported register binds the barcode to. */
  registeredPlateNormalized: string | null;
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
      result: 'ATTACHED';
      message: typeof TRANSPAY_ATTACHED_COPY;
      attachedPlate: string;
      vehicleId: string;
      stickerStatus: string;
    };

/**
 * `null` when the barcode is not on the register: no row at all, or a row
 * carrying no registered plate (the import never writes one, so it would be a
 * defect, and is treated as unknown rather than guessed at). The caller
 * answers that with the generic not-found.
 */
export function describeLegacyBarcode(
  entry: LegacyRegisterEntry | null,
): LegacyBarcodeReading | null {
  if (!entry || entry.registeredPlateNormalized === null) {
    return null;
  }
  if (
    entry.attachedAt !== null &&
    entry.vehicleId !== null &&
    entry.plateNumberAtIssue !== null
  ) {
    return {
      result: 'ATTACHED',
      message: TRANSPAY_ATTACHED_COPY,
      attachedPlate: entry.plateNumberAtIssue,
      vehicleId: entry.vehicleId,
      stickerStatus: entry.status,
    };
  }
  return {
    result: 'RECOGNISED_NOT_ATTACHED',
    message: RECOGNISED_NOT_ATTACHED_COPY,
    registeredPlate: entry.registeredPlateNormalized,
  };
}
