import { describe, expect, it } from 'vitest';

import {
  checkAttachment,
  requiredOnboardingFeeType,
  stickerOrigin,
  type AttachmentContext,
} from './attachment.js';

const VEHICLE_ID = 'vehicle-1';

function context(overrides: Partial<AttachmentContext> = {}): AttachmentContext {
  return {
    isLegacyBarcode: true,
    registeredPlateNormalized: 'AA123XY',
    inStock: false,
    stickerStatus: 'ISSUED',
    targetPlateNormalized: 'AA123XY',
    previouslyAttachedAt: null,
    paymentReferenceAlreadyUsed: false,
    paymentFeeTypeCode: 'STICKER_REATTACHMENT',
    paymentSubject: { type: 'vehicle', id: VEHICLE_ID },
    targetVehicleId: VEHICLE_ID,
    ...overrides,
  };
}

describe('checkAttachment (PRD Requirement 9A.4)', () => {
  it('allows a legacy barcode presented against its registered plate', () => {
    expect(checkAttachment(context())).toEqual({ allowed: true });
  });

  it('refuses a sticker already attached before — one-shot in its life', () => {
    expect(
      checkAttachment(context({ previouslyAttachedAt: new Date('2020-01-01') })),
    ).toEqual({ allowed: false, reason: 'ALREADY_ATTACHED' });
  });

  it('refuses a reused payment reference', () => {
    expect(
      checkAttachment(context({ paymentReferenceAlreadyUsed: true })),
    ).toEqual({ allowed: false, reason: 'PAYMENT_REFERENCE_REUSED' });
  });

  it('refuses a barcode neither on the register nor in stock — unknown, not a forgery', () => {
    expect(
      checkAttachment(context({ registeredPlateNormalized: null })),
    ).toEqual({ allowed: false, reason: 'UNKNOWN_BARCODE' });
  });

  describe('a sticker from stock (Requirement 9A.8, VEH-29)', () => {
    const fromStock = (overrides: Partial<AttachmentContext> = {}) =>
      context({
        registeredPlateNormalized: null,
        inStock: true,
        paymentFeeTypeCode: 'STICKER_NEW',
        ...overrides,
      });

    it('attaches to any plate: its plate is bound by the attachment', () => {
      expect(
        checkAttachment(fromStock({ targetPlateNormalized: 'ZZ000ZZ' })),
      ).toEqual({ allowed: true });
    });

    it('is paid for as a new sticker, never as a reattachment', () => {
      expect(
        checkAttachment(
          fromStock({ paymentFeeTypeCode: 'STICKER_REATTACHMENT' }),
        ),
      ).toEqual({ allowed: false, reason: 'PAYMENT_WRONG_FEE_TYPE' });
    });

    it('still attaches once in its life', () => {
      expect(
        checkAttachment(
          fromStock({ previouslyAttachedAt: new Date('2026-10-01') }),
        ),
      ).toEqual({ allowed: false, reason: 'ALREADY_ATTACHED' });
    });

    it('is refused once it has been withdrawn from stock', () => {
      expect(
        checkAttachment(fromStock({ stickerStatus: 'CANCELLED' })),
      ).toEqual({ allowed: false, reason: 'STICKER_NOT_AVAILABLE' });
    });

    it('still needs the payment to be for this vehicle, and unused', () => {
      expect(
        checkAttachment(
          fromStock({ paymentSubject: { type: 'vehicle', id: 'vehicle-2' } }),
        ),
      ).toEqual({ allowed: false, reason: 'PAYMENT_WRONG_VEHICLE' });
      expect(
        checkAttachment(fromStock({ paymentReferenceAlreadyUsed: true })),
      ).toEqual({ allowed: false, reason: 'PAYMENT_REFERENCE_REUSED' });
    });
  });

  it.each(['DRAFT', 'LOST', 'DAMAGED', 'CANCELLED'])(
    'refuses a sticker that is %s: only an issued one can be attached',
    (stickerStatus) => {
      expect(checkAttachment(context({ stickerStatus }))).toEqual({
        allowed: false,
        reason: 'STICKER_NOT_AVAILABLE',
      });
    },
  );

  it('refuses a barcode presented against the wrong plate, with no override', () => {
    expect(
      checkAttachment(
        context({
          registeredPlateNormalized: 'AA123XY',
          targetPlateNormalized: 'BB999ZZ',
        }),
      ),
    ).toEqual({ allowed: false, reason: 'PLATE_MISMATCH' });
  });

  it('skips the register and plate checks entirely for a freshly signed sticker', () => {
    // A new sticker carries no legacy barcode, so there is nothing to look
    // up on the legacy register — only the one-shot and payment checks
    // apply, matching the reasoning that only a legacy barcode is
    // forgeable by inspection.
    expect(
      checkAttachment(
        context({
          isLegacyBarcode: false,
          registeredPlateNormalized: null,
          targetPlateNormalized: 'ZZ000ZZ',
          paymentFeeTypeCode: 'STICKER_NEW',
        }),
      ),
    ).toEqual({ allowed: true });
  });

  describe('the payment must be the onboarding fee for this vehicle (Requirement 9A.2)', () => {
    it('names the fee type each kind of attachment is paid with', () => {
      expect(requiredOnboardingFeeType('REGISTER')).toBe('STICKER_REATTACHMENT');
      expect(requiredOnboardingFeeType('STOCK')).toBe('STICKER_NEW');
      expect(requiredOnboardingFeeType('SIGNED')).toBe('STICKER_NEW');
    });

    it('tells where a sticker came from', () => {
      const legacy = { isLegacyBarcode: true, inStock: false };
      expect(
        stickerOrigin({ ...legacy, registeredPlateNormalized: 'AA123XY' }),
      ).toBe('REGISTER');
      expect(
        stickerOrigin({
          ...legacy,
          registeredPlateNormalized: null,
          inStock: true,
        }),
      ).toBe('STOCK');
      expect(
        stickerOrigin({ ...legacy, registeredPlateNormalized: null }),
      ).toBeNull();
      expect(
        stickerOrigin({
          isLegacyBarcode: false,
          registeredPlateNormalized: null,
          inStock: false,
        }),
      ).toBe('SIGNED');
    });

    it.each(['MEMBERSHIP', 'LEVY', 'STICKER_NEW'])(
      'refuses a reattachment paid as %s',
      (code) => {
        expect(
          checkAttachment(context({ paymentFeeTypeCode: code })),
        ).toEqual({ allowed: false, reason: 'PAYMENT_WRONG_FEE_TYPE' });
      },
    );

    it('refuses a new sticker paid as a reattachment', () => {
      expect(
        checkAttachment(
          context({
            isLegacyBarcode: false,
            registeredPlateNormalized: null,
            paymentFeeTypeCode: 'STICKER_REATTACHMENT',
          }),
        ),
      ).toEqual({ allowed: false, reason: 'PAYMENT_WRONG_FEE_TYPE' });
    });

    it('refuses a payment made for another vehicle', () => {
      expect(
        checkAttachment(
          context({ paymentSubject: { type: 'vehicle', id: 'vehicle-2' } }),
        ),
      ).toEqual({ allowed: false, reason: 'PAYMENT_WRONG_VEHICLE' });
    });

    it('refuses a payment made for a member, even with a matching id', () => {
      expect(
        checkAttachment(
          context({ paymentSubject: { type: 'member', id: VEHICLE_ID } }),
        ),
      ).toEqual({ allowed: false, reason: 'PAYMENT_WRONG_VEHICLE' });
    });
  });

  it('checks one-shot and payment-reuse before the legacy-only checks', () => {
    // Order matters for which reason is reported: an already-attached
    // sticker is refused for that reason even if it would also fail a
    // legacy check.
    expect(
      checkAttachment(
        context({
          previouslyAttachedAt: new Date('2020-01-01'),
          registeredPlateNormalized: null,
        }),
      ),
    ).toEqual({ allowed: false, reason: 'ALREADY_ATTACHED' });
  });
});
