import { describe, expect, it } from 'vitest';

import {
  checkAttachment,
  requiredOnboardingFeeType,
  stickerOrigin,
  type AttachmentContext,
  type AttachmentPayment,
} from './attachment.js';

const VEHICLE_ID = 'vehicle-1';

function paid(overrides: Partial<AttachmentPayment> = {}): AttachmentPayment {
  return {
    alreadyUsed: false,
    feeTypeCode: 'STICKER_REATTACHMENT',
    subject: { type: 'vehicle', id: VEHICLE_ID },
    ...overrides,
  };
}

function context(overrides: Partial<AttachmentContext> = {}): AttachmentContext {
  return {
    isLegacyBarcode: true,
    registeredPlateNormalized: 'AA123XY',
    inStock: false,
    stickerStatus: 'ISSUED',
    targetPlateNormalized: 'AA123XY',
    previouslyAttachedAt: null,
    feeKobo: 200_000,
    payment: paid(),
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
      checkAttachment(context({ payment: paid({ alreadyUsed: true }) })),
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
        payment: paid({ feeTypeCode: 'STICKER_NEW' }),
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
          fromStock({ payment: paid({ feeTypeCode: 'STICKER_REATTACHMENT' }) }),
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
          fromStock({
            payment: paid({
              feeTypeCode: 'STICKER_NEW',
              subject: { type: 'vehicle', id: 'vehicle-2' },
            }),
          }),
        ),
      ).toEqual({ allowed: false, reason: 'PAYMENT_WRONG_VEHICLE' });
      expect(
        checkAttachment(
          fromStock({
            payment: paid({ feeTypeCode: 'STICKER_NEW', alreadyUsed: true }),
          }),
        ),
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
          payment: paid({ feeTypeCode: 'STICKER_NEW' }),
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
          checkAttachment(context({ payment: paid({ feeTypeCode: code }) })),
        ).toEqual({ allowed: false, reason: 'PAYMENT_WRONG_FEE_TYPE' });
      },
    );

    it('refuses a new sticker paid as a reattachment', () => {
      expect(
        checkAttachment(
          context({
            isLegacyBarcode: false,
            registeredPlateNormalized: null,
            payment: paid({ feeTypeCode: 'STICKER_REATTACHMENT' }),
          }),
        ),
      ).toEqual({ allowed: false, reason: 'PAYMENT_WRONG_FEE_TYPE' });
    });

    it('refuses a payment made for another vehicle', () => {
      expect(
        checkAttachment(
          context({
            payment: paid({ subject: { type: 'vehicle', id: 'vehicle-2' } }),
          }),
        ),
      ).toEqual({ allowed: false, reason: 'PAYMENT_WRONG_VEHICLE' });
    });

    it('refuses a payment made for a member, even with a matching id', () => {
      expect(
        checkAttachment(
          context({
            payment: paid({ subject: { type: 'member', id: VEHICLE_ID } }),
          }),
        ),
      ).toEqual({ allowed: false, reason: 'PAYMENT_WRONG_VEHICLE' });
    });
  });

  describe('a free sticker (VEH-37)', () => {
    it('is refused without a payment while it costs something', () => {
      expect(checkAttachment(context({ payment: null }))).toEqual({
        allowed: false,
        reason: 'PAYMENT_NOT_CONFIRMED',
      });
    });

    it('attaches without a payment once its fee is nothing', () => {
      expect(checkAttachment(context({ feeKobo: 0, payment: null }))).toEqual({
        allowed: true,
      });
      expect(
        checkAttachment(
          context({
            registeredPlateNormalized: null,
            inStock: true,
            targetPlateNormalized: 'ZZ000ZZ',
            feeKobo: 0,
            payment: null,
          }),
        ),
      ).toEqual({ allowed: true });
    });

    it('still holds every other condition', () => {
      const free = { feeKobo: 0, payment: null };
      expect(
        checkAttachment(context({ ...free, targetPlateNormalized: 'BB999ZZ' })),
      ).toEqual({ allowed: false, reason: 'PLATE_MISMATCH' });
      expect(
        checkAttachment(
          context({ ...free, previouslyAttachedAt: new Date('2026-10-01') }),
        ),
      ).toEqual({ allowed: false, reason: 'ALREADY_ATTACHED' });
      expect(
        checkAttachment(context({ ...free, stickerStatus: 'CANCELLED' })),
      ).toEqual({ allowed: false, reason: 'STICKER_NOT_AVAILABLE' });
      expect(
        checkAttachment(context({ ...free, registeredPlateNormalized: null })),
      ).toEqual({ allowed: false, reason: 'UNKNOWN_BARCODE' });
    });

    it('checks a payment presented anyway in full', () => {
      expect(
        checkAttachment(
          context({ feeKobo: 0, payment: paid({ feeTypeCode: 'LEVY' }) }),
        ),
      ).toEqual({ allowed: false, reason: 'PAYMENT_WRONG_FEE_TYPE' });
      expect(
        checkAttachment(
          context({ feeKobo: 0, payment: paid({ alreadyUsed: true }) }),
        ),
      ).toEqual({ allowed: false, reason: 'PAYMENT_REFERENCE_REUSED' });
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
