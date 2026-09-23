import { describe, expect, it } from 'vitest';

import {
  InvalidStickerTransitionError,
  STICKER_STATUSES,
  assertStickerTransition,
  canTransitionSticker,
  isStickerAttached,
  isStickerFinal,
} from './status.js';

const LEGAL: readonly [string, string][] = [
  ['DRAFT', 'ISSUED'],
  ['DRAFT', 'CANCELLED'],
  ['ISSUED', 'ACTIVE'],
  ['ISSUED', 'LOST'],
  ['ISSUED', 'DAMAGED'],
  ['ISSUED', 'CANCELLED'],
  ['ACTIVE', 'SUSPENDED'],
  ['ACTIVE', 'LOST'],
  ['ACTIVE', 'DAMAGED'],
  ['ACTIVE', 'EXPIRED'],
  ['ACTIVE', 'REPLACED'],
  ['SUSPENDED', 'ACTIVE'],
  ['SUSPENDED', 'REPLACED'],
  ['SUSPENDED', 'CANCELLED'],
  ['LOST', 'REPLACED'],
  ['LOST', 'CANCELLED'],
  ['DAMAGED', 'REPLACED'],
  ['DAMAGED', 'CANCELLED'],
  ['EXPIRED', 'REPLACED'],
  ['EXPIRED', 'CANCELLED'],
];

describe('sticker lifecycle', () => {
  it('permits exactly the legal transitions and refuses every other pair', () => {
    const legal = new Set(LEGAL.map(([a, b]) => `${a}->${b}`));
    for (const from of STICKER_STATUSES) {
      for (const to of STICKER_STATUSES) {
        expect(canTransitionSticker(from, to), `${from} -> ${to}`).toBe(
          legal.has(`${from}->${to}`),
        );
      }
    }
  });

  it('refuses a status transitioning to itself', () => {
    for (const status of STICKER_STATUSES) {
      expect(canTransitionSticker(status, status)).toBe(false);
    }
  });

  it('treats REPLACED and CANCELLED as final', () => {
    expect(isStickerFinal('REPLACED')).toBe(true);
    expect(isStickerFinal('CANCELLED')).toBe(true);
    expect(isStickerFinal('ACTIVE')).toBe(false);
  });

  it('never lets a lost, damaged, or expired sticker return to ACTIVE', () => {
    for (const from of ['LOST', 'DAMAGED', 'EXPIRED'] as const) {
      expect(canTransitionSticker(from, 'ACTIVE')).toBe(false);
    }
  });

  it('treats ACTIVE and SUSPENDED as attached, nothing else', () => {
    expect(isStickerAttached('ACTIVE')).toBe(true);
    expect(isStickerAttached('SUSPENDED')).toBe(true);
    for (const status of STICKER_STATUSES.filter(
      (s) => s !== 'ACTIVE' && s !== 'SUSPENDED',
    )) {
      expect(isStickerAttached(status)).toBe(false);
    }
  });

  it('names the permitted transitions when it throws', () => {
    expect(() => assertStickerTransition('LOST', 'ACTIVE')).toThrow(
      InvalidStickerTransitionError,
    );
    expect(() => assertStickerTransition('LOST', 'ACTIVE')).toThrow(
      /Permitted: REPLACED, CANCELLED/,
    );
  });

  it('says so plainly when the source status is final', () => {
    expect(() => assertStickerTransition('CANCELLED', 'ACTIVE')).toThrow(
      /CANCELLED is final/,
    );
  });
});
