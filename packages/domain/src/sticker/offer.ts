/**
 * What a vehicle without a sticker can be given now (item 35, `QUESTIONS.md`
 * VEH-30).
 *
 * The vehicle's page and the prompt after adding a vehicle both ask this, so
 * the two can never disagree about whether there is anything to buy.
 */

/**
 * New signed NURTW stickers are paused (`QUESTIONS.md` VEH-20, the owner's
 * direction of 3 October 2026). Until they are printed, a vehicle is given
 * the sticker recorded for its plate, or one from stock (VEH-29). The signed
 * path stays built, and switching it back on is this one flag. Printing
 * (deferred) and the QR domain (GOV-08) must come first.
 */
export const NEW_STICKERS_IN_USE = false;

export const STICKER_OFFERS = [
  /** A sticker is attached: nothing to ask. */
  'ATTACHED',
  /** The register holds a barcode for the plate: pay, then reattach. */
  'REATTACH',
  /** Nothing recorded for the plate, and stock holds stickers: pay, then attach one. */
  'FROM_STOCK',
  /** Nothing recorded or in stock, and signed stickers are in use. */
  'NEW_STICKER',
  /** Nothing can be given yet, so nothing is charged (VEH-30). */
  'NONE_YET',
] as const;

export type StickerOffer = (typeof STICKER_OFFERS)[number];

export function stickerOffer(facts: {
  attached: boolean;
  /** The register holds an unattached barcode for this plate (never which). */
  registerHoldsBarcodeForPlate: boolean;
  /** Stock holds at least one sticker that can still be attached. */
  stockHasStickers: boolean;
  newStickersInUse: boolean;
}): StickerOffer {
  if (facts.attached) {
    return 'ATTACHED';
  }
  if (facts.registerHoldsBarcodeForPlate) {
    return 'REATTACH';
  }
  if (facts.stockHasStickers) {
    return 'FROM_STOCK';
  }
  return facts.newStickersInUse ? 'NEW_STICKER' : 'NONE_YET';
}

/** Whether there is anything to pay for, or attach, at all. */
export function stickerCanBeGiven(offer: StickerOffer): boolean {
  return (
    offer === 'REATTACH' || offer === 'FROM_STOCK' || offer === 'NEW_STICKER'
  );
}
