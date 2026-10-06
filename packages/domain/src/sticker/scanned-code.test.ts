import { describe, expect, it } from 'vitest';

import {
  isLegacyBarcode,
  looksLikeStickerCode,
  stickerCodeFromScan,
} from './scanned-code.js';

describe('stickerCodeFromScan (PRD Requirement 9A.7)', () => {
  it.each([
    'https://www.example.test/v/status1700000000001',
    'https://www.example.test/v/status/1700000000001',
    'https://www.example.test/v/status/1700000000001/',
    'http://example.test/1700000000001',
    '  https://www.example.test/v/status1700000000001  ',
    'https://www.example.test/v/status/1700000000001?from=camera#top',
  ])('reads the barcode a legacy sticker address ends in: %s', (scanned) => {
    expect(stickerCodeFromScan(scanned)).toBe('1700000000001');
  });

  it('does not care whose address it is: the register decides, not the address', () => {
    expect(
      stickerCodeFromScan('https://anything.example/whatever/1700000000001'),
    ).toBe('1700000000001');
  });

  it('leaves a typed number as it is, leading zeros and all', () => {
    expect(stickerCodeFromScan(' 0170000000001 ')).toBe('0170000000001');
  });

  it("leaves a signed sticker's payload as it is", () => {
    expect(stickerCodeFromScan('ab12cd34.k1.0123456789abcdef')).toBe(
      'ab12cd34.k1.0123456789abcdef',
    );
  });

  it('leaves an address that ends in no barcode as it is, to be refused as it stands', () => {
    expect(stickerCodeFromScan('https://example.test/menu')).toBe(
      'https://example.test/menu',
    );
    // Digits in the middle of an address are not a barcode at its end.
    expect(stickerCodeFromScan('https://example.test/1700000000001/menu')).toBe(
      'https://example.test/1700000000001/menu',
    );
    // Too few digits to be one.
    expect(stickerCodeFromScan('https://example.test/item/12345')).toBe(
      'https://example.test/item/12345',
    );
  });
});

describe('isLegacyBarcode', () => {
  it.each(['17000000001', '170000000001', '1700000000001', '17000000000001'])(
    'accepts the lengths the imported register holds: %s',
    (code) => {
      expect(isLegacyBarcode(code)).toBe(true);
    },
  );

  it.each([
    '',
    '123456789',
    '1700000000001x',
    '1700 000000001',
    '1234567890123456',
  ])('refuses %j', (code) => {
    expect(isLegacyBarcode(code)).toBe(false);
  });
});

describe('looksLikeStickerCode', () => {
  it('accepts a legacy barcode and a signed payload', () => {
    expect(looksLikeStickerCode('1700000000001')).toBe(true);
    expect(looksLikeStickerCode('ab12cd34.k1.0123456789abcdef')).toBe(true);
  });

  it('refuses whatever else a camera might read', () => {
    expect(looksLikeStickerCode('https://example.test/menu')).toBe(false);
    expect(looksLikeStickerCode('WIFI:S:guest;T:WPA;P:secret;;')).toBe(false);
    expect(looksLikeStickerCode('hello world')).toBe(false);
  });
});
