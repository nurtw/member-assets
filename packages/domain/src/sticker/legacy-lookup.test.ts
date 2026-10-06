import { describe, expect, it } from 'vitest';

import {
  IN_STOCK_COPY,
  RECOGNISED_NOT_ATTACHED_COPY,
  WITHDRAWN_COPY,
  describeLegacyBarcode,
  isHeldBarcode,
  stickerStockStanding,
  type LegacyRegisterEntry,
} from './legacy-lookup.js';

function entry(overrides: Partial<LegacyRegisterEntry> = {}): LegacyRegisterEntry {
  return {
    registeredPlateNormalized: 'AA123XY',
    stockAddedAt: null,
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

  it('treats a row neither on the register nor in stock as unknown, never guessing', () => {
    expect(
      describeLegacyBarcode(entry({ registeredPlateNormalized: null })),
    ).toBeNull();
  });

  describe('a sticker taken into stock (Requirement 9A.8, VEH-29)', () => {
    const stock = (overrides: Partial<LegacyRegisterEntry> = {}) =>
      entry({
        registeredPlateNormalized: null,
        stockAddedAt: new Date('2026-10-05T10:00:00Z'),
        ...overrides,
      });

    it('reads as in stock, with no plate: it is bound to none yet', () => {
      expect(describeLegacyBarcode(stock())).toEqual({
        result: 'IN_STOCK',
        message: 'Recognised sticker — in stock, not attached',
      });
    });

    it('reads as attached once it is on a vehicle, like any other sticker', () => {
      expect(
        describeLegacyBarcode(
          stock({
            attachedAt: new Date('2026-10-06T09:00:00Z'),
            plateNumberAtIssue: 'ZZ000ZZ',
            vehicleId: 'vehicle-9',
            status: 'ACTIVE',
          }),
        ),
      ).toEqual({
        result: 'ATTACHED',
        message: 'Sticker — attached through the System',
        attachedPlate: 'ZZ000ZZ',
        vehicleId: 'vehicle-9',
        stickerStatus: 'ACTIVE',
      });
    });

    it('reads as withdrawn once it has been taken out of stock', () => {
      expect(describeLegacyBarcode(stock({ status: 'CANCELLED' }))).toEqual({
        result: 'WITHDRAWN',
        message: WITHDRAWN_COPY,
      });
    });
  });

  it('says nowhere which scheme a sticker belongs to, or that one is genuine', () => {
    for (const copy of [
      RECOGNISED_NOT_ATTACHED_COPY,
      IN_STOCK_COPY,
      WITHDRAWN_COPY,
    ]) {
      expect(copy.toLowerCase()).not.toContain('genuine');
      expect(copy.toLowerCase()).not.toContain('legacy');
    }
  });
});

describe('isHeldBarcode', () => {
  it('holds a barcode on the register, and one in stock, and no other', () => {
    expect(
      isHeldBarcode({ registeredPlateNormalized: 'AA123XY', stockAddedAt: null }),
    ).toBe(true);
    expect(
      isHeldBarcode({
        registeredPlateNormalized: null,
        stockAddedAt: new Date('2026-10-05T10:00:00Z'),
      }),
    ).toBe(true);
    expect(
      isHeldBarcode({ registeredPlateNormalized: null, stockAddedAt: null }),
    ).toBe(false);
  });
});

describe('stickerStockStanding', () => {
  it('is worked out from the row', () => {
    expect(stickerStockStanding({ attachedAt: null, status: 'ISSUED' })).toBe(
      'IN_STOCK',
    );
    expect(
      stickerStockStanding({ attachedAt: new Date(), status: 'ACTIVE' }),
    ).toBe('ATTACHED');
    expect(stickerStockStanding({ attachedAt: null, status: 'CANCELLED' })).toBe(
      'WITHDRAWN',
    );
  });
});
