import { describe, expect, it } from 'vitest';

import {
  NEW_STICKERS_IN_USE,
  stickerCanBeGiven,
  stickerOffer,
} from './offer.js';

describe('stickerOffer', () => {
  it('asks nothing of a vehicle that already carries a sticker', () => {
    expect(
      stickerOffer({
        attached: true,
        registerHoldsBarcodeForPlate: true,
        newStickersInUse: true,
      }),
    ).toBe('ATTACHED');
  });

  it('offers reattachment when the register holds a barcode for the plate', () => {
    for (const newStickersInUse of [true, false]) {
      expect(
        stickerOffer({
          attached: false,
          registerHoldsBarcodeForPlate: true,
          newStickersInUse,
        }),
      ).toBe('REATTACH');
    }
  });

  it('offers a new sticker only while new stickers are in use', () => {
    expect(
      stickerOffer({
        attached: false,
        registerHoldsBarcodeForPlate: false,
        newStickersInUse: true,
      }),
    ).toBe('NEW_STICKER');
  });

  it('offers nothing, and so charges nothing, while new stickers are paused (VEH-30)', () => {
    const offer = stickerOffer({
      attached: false,
      registerHoldsBarcodeForPlate: false,
      newStickersInUse: false,
    });
    expect(offer).toBe('NONE_YET');
    expect(stickerCanBeGiven(offer)).toBe(false);
  });

  it('keeps new stickers paused, as the owner directed on 3 October 2026 (VEH-20)', () => {
    expect(NEW_STICKERS_IN_USE).toBe(false);
  });
});

describe('stickerCanBeGiven', () => {
  it('is true only where something can be paid for and attached', () => {
    expect(stickerCanBeGiven('REATTACH')).toBe(true);
    expect(stickerCanBeGiven('NEW_STICKER')).toBe(true);
    expect(stickerCanBeGiven('ATTACHED')).toBe(false);
    expect(stickerCanBeGiven('NONE_YET')).toBe(false);
  });
});
