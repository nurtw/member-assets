import { describe, expect, it } from 'vitest';

import {
  isPayLinkCode,
  PAY_LINK_FEE_TYPES,
  payLinkLabel,
  payLinkOffers,
} from './pay-link.js';

describe('what a pay link offers (PAY-21)', () => {
  it('offers a vehicle its levy and a member the yearly fee', () => {
    expect(PAY_LINK_FEE_TYPES.vehicle).toEqual(['LEVY']);
    expect(PAY_LINK_FEE_TYPES.member).toEqual(['MEMBERSHIP']);
  });

  it('offers nothing across kinds, and no sticker fee', () => {
    expect(payLinkOffers('vehicle', 'LEVY')).toBe(true);
    expect(payLinkOffers('vehicle', 'MEMBERSHIP')).toBe(false);
    expect(payLinkOffers('member', 'LEVY')).toBe(false);
    expect(payLinkOffers('vehicle', 'STICKER_NEW')).toBe(false);
    expect(payLinkOffers('vehicle', 'STICKER_REATTACHMENT')).toBe(false);
  });
});

describe("a pay link's code", () => {
  it('is 22 base64url characters', () => {
    expect(isPayLinkCode('AbCdEfGhIjKlMnOpQrSt_-')).toBe(true);
  });

  it('refuses anything else before a lookup', () => {
    for (const value of [
      '',
      'short',
      'AbCdEfGhIjKlMnOpQrSt_-x',
      'AbCdEfGhIjKlMnOpQrSt+/',
      'AbCdEfGhIjKlMnOpQrSt_=',
      '../../etc/passwd/xxxxxxx',
    ]) {
      expect(isPayLinkCode(value)).toBe(false);
    }
  });
});

describe('what the public page names the subject by', () => {
  it('names a vehicle by its plate as entered', () => {
    expect(
      payLinkLabel({ type: 'vehicle', plateNumberDisplay: 'AWK-123-XY' }),
    ).toBe('AWK-123-XY');
  });

  it('names a member by first name and membership number only', () => {
    expect(
      payLinkLabel({
        type: 'member',
        firstName: 'Chinedu',
        membershipNumber: 'NURTW/AN/000123',
      }),
    ).toBe('Chinedu · NURTW/AN/000123');
  });

  it('names a member not yet approved by first name alone', () => {
    expect(
      payLinkLabel({
        type: 'member',
        firstName: 'Chinedu',
        membershipNumber: null,
      }),
    ).toBe('Chinedu');
  });
});
