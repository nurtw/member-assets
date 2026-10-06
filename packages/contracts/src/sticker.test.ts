import { describe, expect, it } from 'vitest';

import { checkPaymentsSchema } from './payments.js';
import {
  addStickerStockSchema,
  attachStickerSchema,
  legacyBarcodeLookupSchema,
  stickerReadingSchema,
  withdrawStickerStockSchema,
} from './sticker.js';
import { verifySchema } from './verification.js';

const VEHICLE = '3f2b1c9e-6a4d-4e7b-9c1a-2d5e8f7a6b3c';
const PAYMENT = '9c1a2d5e-8f7a-4b3c-a3f2-b1c9e6a4d4e7';
/** What a camera reads from a legacy sticker: an address ending in its barcode. */
const SCANNED = 'https://www.example.test/v/status/1700000000001';

describe('what a camera reads is reduced to the barcode, wherever it is sent', () => {
  it('adding to stock', () => {
    expect(addStickerStockSchema.parse({ code: SCANNED })).toEqual({
      code: '1700000000001',
    });
  });

  it('attaching', () => {
    expect(
      attachStickerSchema.parse({
        legacyBarcode: SCANNED,
        vehicleId: VEHICLE,
        paymentId: PAYMENT,
      }).legacyBarcode,
    ).toBe('1700000000001');
  });

  it('the reading before an attachment, and the internal lookup', () => {
    expect(stickerReadingSchema.parse({ code: SCANNED }).code).toBe(
      '1700000000001',
    );
    expect(legacyBarcodeLookupSchema.parse({ barcode: SCANNED }).barcode).toBe(
      '1700000000001',
    );
  });

  it('a verification, so an address is never tried as a signed code', () => {
    expect(verifySchema.parse({ stickerCode: SCANNED }).stickerCode).toBe(
      '1700000000001',
    );
  });

  it("leaves a signed sticker's payload, and a typed number, as they are", () => {
    const signed = 'ab12cd34.k1.0123456789abcdef';
    expect(verifySchema.parse({ stickerCode: signed }).stickerCode).toBe(
      signed,
    );
    expect(
      verifySchema.parse({ stickerCode: ' 1700000000001 ' }).stickerCode,
    ).toBe('1700000000001');
  });
});

describe('addStickerStockSchema (Requirement 9A.8)', () => {
  it.each([
    'https://example.test/menu',
    'not a barcode',
    '12345',
    'ab12cd34.k1.0123456789abcdef',
    '',
  ])('refuses %j, naming the field', (code) => {
    const result = addStickerStockSchema.safeParse({ code });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['code']);
  });

  it('accepts a number typed in', () => {
    expect(addStickerStockSchema.parse({ code: ' 1700000000001 ' }).code).toBe(
      '1700000000001',
    );
  });
});

describe('withdrawStickerStockSchema', () => {
  it('needs a reason worth keeping', () => {
    expect(
      withdrawStickerStockSchema.safeParse({ reason: ' ok ' }).success,
    ).toBe(false);
    expect(
      withdrawStickerStockSchema.parse({ reason: ' torn in the box ' }).reason,
    ).toBe('torn in the box');
  });
});

describe('checkPaymentsSchema', () => {
  it('names one vehicle or member, and nothing else', () => {
    expect(
      checkPaymentsSchema.parse({
        subjectType: 'vehicle',
        subjectId: VEHICLE,
        reference: 'ignored',
      }),
    ).toEqual({ subjectType: 'vehicle', subjectId: VEHICLE });
    expect(
      checkPaymentsSchema.safeParse({
        subjectType: 'sticker',
        subjectId: VEHICLE,
      }).success,
    ).toBe(false);
  });
});
