import { describe, expect, it } from 'vitest';

import {
  NEW_STICKERS_IN_USE,
  stickerCanBeGiven,
  stickerOffer,
} from './offer.js';

const NOTHING = {
  attached: false,
  registerHoldsBarcodeForPlate: false,
  stockHasStickers: false,
  newStickersInUse: false,
};

describe('stickerOffer', () => {
  it('asks nothing of a vehicle that already carries a sticker', () => {
    expect(
      stickerOffer({
        attached: true,
        registerHoldsBarcodeForPlate: true,
        stockHasStickers: true,
        newStickersInUse: true,
      }),
    ).toBe('ATTACHED');
  });

  it('offers reattachment when the register holds a barcode for the plate', () => {
    for (const newStickersInUse of [true, false]) {
      for (const stockHasStickers of [true, false]) {
        expect(
          stickerOffer({
            ...NOTHING,
            registerHoldsBarcodeForPlate: true,
            stockHasStickers,
            newStickersInUse,
          }),
        ).toBe('REATTACH');
      }
    }
  });

  it('offers a sticker from stock when nothing is recorded for the plate (VEH-29)', () => {
    for (const newStickersInUse of [true, false]) {
      expect(
        stickerOffer({ ...NOTHING, stockHasStickers: true, newStickersInUse }),
      ).toBe('FROM_STOCK');
    }
  });

  it('offers a signed sticker only while signed stickers are in use', () => {
    expect(stickerOffer({ ...NOTHING, newStickersInUse: true })).toBe(
      'NEW_STICKER',
    );
  });

  it('offers nothing, and so charges nothing, when there is nothing to give (VEH-30)', () => {
    const offer = stickerOffer(NOTHING);
    expect(offer).toBe('NONE_YET');
    expect(stickerCanBeGiven(offer)).toBe(false);
  });

  it('keeps signed stickers paused, as the owner directed on 3 October 2026 (VEH-20)', () => {
    expect(NEW_STICKERS_IN_USE).toBe(false);
  });
});

describe('stickerCanBeGiven', () => {
  it('is true only where something can be paid for and attached', () => {
    expect(stickerCanBeGiven('REATTACH')).toBe(true);
    expect(stickerCanBeGiven('FROM_STOCK')).toBe(true);
    expect(stickerCanBeGiven('NEW_STICKER')).toBe(true);
    expect(stickerCanBeGiven('ATTACHED')).toBe(false);
    expect(stickerCanBeGiven('NONE_YET')).toBe(false);
  });
});
