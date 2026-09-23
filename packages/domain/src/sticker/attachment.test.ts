import { describe, expect, it } from 'vitest';

import { checkAttachment, type AttachmentContext } from './attachment.js';

function context(overrides: Partial<AttachmentContext> = {}): AttachmentContext {
  return {
    isLegacyBarcode: true,
    registeredPlateNormalized: 'AA123XY',
    targetPlateNormalized: 'AA123XY',
    previouslyAttachedAt: null,
    paymentReferenceAlreadyUsed: false,
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

  it('refuses a barcode not on the imported register — recorded as unknown, not a forgery', () => {
    expect(
      checkAttachment(context({ registeredPlateNormalized: null })),
    ).toEqual({ allowed: false, reason: 'UNKNOWN_BARCODE' });
  });

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
    // up on the Transpay register — only the one-shot and payment checks
    // apply, matching the reasoning that only a legacy barcode is
    // forgeable by inspection.
    expect(
      checkAttachment(
        context({
          isLegacyBarcode: false,
          registeredPlateNormalized: null,
          targetPlateNormalized: 'ZZ000ZZ',
        }),
      ),
    ).toEqual({ allowed: true });
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
