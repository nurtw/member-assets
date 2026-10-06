import { describe, expect, it } from 'vitest';

import {
  RECOGNISED_NOT_ATTACHED_COPY,
  describeLegacyBarcode,
  type LegacyRegisterEntry,
} from './legacy-lookup.js';

function entry(overrides: Partial<LegacyRegisterEntry> = {}): LegacyRegisterEntry {
  return {
    registeredPlateNormalized: 'AA123XY',
    attachedAt: null,
    plateNumberAtIssue: null,
    vehicleId: null,
    status: 'ISSUED',
    ...overrides,
  };
}

describe('describeLegacyBarcode (PRD Requirement 11.2)', () => {
  it('reads an unattached register barcode as recognised, not attached, with its plate', () => {
    expect(describeLegacyBarcode(entry())).toEqual({
      result: 'RECOGNISED_NOT_ATTACHED',
      message: 'Recognised sticker — not attached',
      registeredPlate: 'AA123XY',
    });
  });

  it('never calls the sticker genuine — a copy scans identically (VEH-14)', () => {
    expect(RECOGNISED_NOT_ATTACHED_COPY.toLowerCase()).not.toContain('genuine');
  });

  it('reads an attached barcode as attached, with the plate recorded at attachment', () => {
    const attachedAt = new Date('2026-10-01T09:00:00Z');
    expect(
      describeLegacyBarcode(
        entry({
          attachedAt,
          plateNumberAtIssue: 'AA123XY',
          vehicleId: 'vehicle-1',
          status: 'ACTIVE',
        }),
      ),
    ).toEqual({
      result: 'ATTACHED',
      message: 'Sticker — attached through the System',
      attachedPlate: 'AA123XY',
      vehicleId: 'vehicle-1',
      stickerStatus: 'ACTIVE',
    });
  });

  it('treats a barcode with no register row as unknown', () => {
    expect(describeLegacyBarcode(null)).toBeNull();
  });

  it('treats a row with no registered plate as unknown, never guessing one', () => {
    expect(
      describeLegacyBarcode(entry({ registeredPlateNormalized: null })),
    ).toBeNull();
  });
});
