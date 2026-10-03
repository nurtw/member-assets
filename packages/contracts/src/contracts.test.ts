import { generateIdentifier } from '@nurtw/domain';
import { describe, expect, it } from 'vitest';

import {
  API_SCOPES,
  CARD_STATUSES,
  DECLARATION_STATUSES,
  DEFAULT_AGGREGATE_SUPPRESSION_FLOOR,
  LEGACY_VEHICLE_CATEGORY_SEED,
  ORGANISATION_LEVELS,
  STICKER_STATUSES,
  VERIFIABLE_DECLARATION_STATUSES,
  VERIFIABLE_STICKER_STATUSES,
  externalCombinedVerificationSchema,
  externalMembershipVerificationSchema,
  externalPlateVerificationSchema,
  externalStickerVerificationSchema,
  reissueVehicleLetterSchema,
  verifyMembershipSchema,
  verifySchema,
} from './index.js';

describe('scopes', () => {
  /**
   * PRD Requirement 12.4 — broad scopes must not be *defined*, not merely
   * withheld. A scope that does not exist cannot be granted by mistake, whether
   * through a UI slip, a seed script, or a well-meaning support request.
   *
   * This test is the enforcement of that requirement. If someone later adds a
   * convenient catch-all scope, this fails rather than shipping.
   */
  it('defines no broad or catch-all scope', () => {
    const forbidden = [
      'database:read',
      'member:read:all',
      'admin',
      '*',
      'all',
      'read:all',
      'vehicle:read:all',
    ];

    for (const scope of forbidden) {
      expect(API_SCOPES as readonly string[]).not.toContain(scope);
    }
  });

  it('defines only narrow, colon-delimited scopes', () => {
    for (const scope of API_SCOPES) {
      expect(scope).toMatch(/^[a-z_]+(?::[a-z_]+){1,2}$/);
      expect(scope).not.toContain('*');
    }
  });

  it('contains no duplicates', () => {
    expect(new Set(API_SCOPES).size).toBe(API_SCOPES.length);
  });

  it('offers both aggregate tiers', () => {
    // PRD §13.2 — the unfiltered total tier exists precisely because an
    // unfiltered count cannot be differenced.
    expect(API_SCOPES).toContain('aggregate:vehicles:total');
    expect(API_SCOPES).toContain('aggregate:vehicles:read');
  });

  it('seeds the determined suppression floor', () => {
    expect(DEFAULT_AGGREGATE_SUPPRESSION_FLOOR).toBe(25);
  });
});

describe('statuses', () => {
  it.each([
    ['card', CARD_STATUSES],
    ['sticker', STICKER_STATUSES],
    ['declaration', DECLARATION_STATUSES],
  ])('%s statuses are unique', (_label, statuses) => {
    expect(new Set(statuses).size).toBe(statuses.length);
  });

  it('matches the lifecycle sizes fixed by the PRD', () => {
    expect(CARD_STATUSES).toHaveLength(9); // PRD §8
    expect(STICKER_STATUSES).toHaveLength(9); // PRD §10
    // PRD §9's original six, plus ON_RECORD (revision 1.2, §9A, Decision 6.5).
    expect(DECLARATION_STATUSES).toHaveLength(7);
  });

  it('includes DAMAGED for stickers only', () => {
    expect(STICKER_STATUSES as readonly string[]).toContain('DAMAGED');
    expect(CARD_STATUSES as readonly string[]).not.toContain('DAMAGED');
  });

  /**
   * PRD Requirement 26.3 — a valid signature is necessary but never sufficient;
   * a positive verification additionally requires an active record of good
   * status. Keeping these sets minimal is what makes that true. Widening either
   * to something like "not cancelled" would admit LOST and REPLACED articles.
   */
  it('permits verification only against active records', () => {
    expect(VERIFIABLE_STICKER_STATUSES).toEqual(['ACTIVE']);
    expect(VERIFIABLE_DECLARATION_STATUSES).toEqual(['ACTIVE']);
  });

  it('never treats a lost or replaced article as verifiable', () => {
    for (const status of ['LOST', 'REPLACED', 'SUSPENDED', 'CANCELLED']) {
      expect(VERIFIABLE_STICKER_STATUSES as readonly string[]).not.toContain(
        status,
      );
    }
  });
});

describe('master data', () => {
  it('orders the hierarchy outermost first', () => {
    // PRD §23.1 — Council -> Zone -> Branch -> Unit -> Member.
    expect(ORGANISATION_LEVELS).toEqual(['COUNCIL', 'ZONE', 'BRANCH', 'UNIT']);
  });

  it('carries legacy category counts totalling the exported register', () => {
    // 2,841 vehicles in the export. Asserting the total keeps the seed honest
    // against the reconciliation report produced by roadmap item 09.
    const total = LEGACY_VEHICLE_CATEGORY_SEED.reduce(
      (sum, entry) => sum + entry.legacyCount,
      0,
    );

    expect(total).toBe(2841);
  });

  it('uses unique category codes', () => {
    const codes = LEGACY_VEHICLE_CATEGORY_SEED.map((entry) => entry.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('verification request (item 10)', () => {
  it('takes a plate, a sticker code, or both', () => {
    expect(verifySchema.safeParse({ plateNumber: 'AA 123 XY' }).success).toBe(
      true,
    );
    expect(
      verifySchema.safeParse({ stickerCode: '1600000000000' }).success,
    ).toBe(true);
    expect(
      verifySchema.safeParse({
        plateNumber: 'AA-123-XY',
        stickerCode: 'X.k1.0f',
      }).success,
    ).toBe(true);
  });

  it('refuses an empty request', () => {
    expect(verifySchema.safeParse({}).success).toBe(false);
  });

  it('refuses a plate that cannot be normalised, rather than looking it up', () => {
    expect(verifySchema.safeParse({ plateNumber: 'A-1' }).success).toBe(false);
    expect(verifySchema.safeParse({ plateNumber: '---' }).success).toBe(false);
  });

  it('strips anything else a caller sends', () => {
    const parsed = verifySchema.parse({
      plateNumber: 'AA123XY',
      channel: 'EXTERNAL',
    });
    expect(parsed).toEqual({ plateNumber: 'AA123XY' });
  });
});

describe('external verification requests (item 12)', () => {
  it('take the proposal’s names, and nothing else', () => {
    expect(
      externalPlateVerificationSchema.parse({
        plate_number: 'AA 123 XY',
        plateNumber: 'ignored',
        profile: 'INTERNAL',
      }),
    ).toEqual({ plate_number: 'AA 123 XY' });
    expect(
      externalPlateVerificationSchema.safeParse({ plateNumber: 'AA123XY' })
        .success,
    ).toBe(false);
  });

  it('validate a plate exactly as the internal check does', () => {
    for (const plate of ['A-1', '---', 'X'.repeat(21)]) {
      expect(
        externalPlateVerificationSchema.safeParse({ plate_number: plate })
          .success,
      ).toBe(false);
      expect(verifySchema.safeParse({ plateNumber: plate }).success).toBe(
        false,
      );
    }
  });

  it('need both a plate and a code for a combined check', () => {
    expect(
      externalCombinedVerificationSchema.safeParse({ plate_number: 'AA123XY' })
        .success,
    ).toBe(false);
    expect(
      externalCombinedVerificationSchema.safeParse({
        plate_number: 'AA123XY',
        sticker_qr_id: '1600000000000',
      }).success,
    ).toBe(true);
    expect(
      externalStickerVerificationSchema.safeParse({ sticker_qr_id: '' })
        .success,
    ).toBe(false);
  });

  it('refuse a membership number that fails its check character', () => {
    const number = generateIdentifier(() => 7);
    const mistyped = number.replace(/.$/, (last) => (last === 'A' ? 'B' : 'A'));
    expect(
      externalMembershipVerificationSchema.safeParse({ number }).success,
    ).toBe(true);
    expect(
      externalMembershipVerificationSchema.safeParse({ number: mistyped })
        .success,
    ).toBe(false);
  });
});

describe('membership verification request (item 24)', () => {
  // A fixed byte source keeps the generated number the same on every run.
  const number = generateIdentifier(() => 7);

  it('accepts a number as printed, however it is typed', () => {
    expect(verifyMembershipSchema.safeParse({ number }).success).toBe(true);
    expect(
      verifyMembershipSchema.safeParse({
        number: number.toLowerCase().replace(/-/g, ' '),
      }).success,
    ).toBe(true);
  });

  it('refuses a number that fails its check character, before any lookup', () => {
    const mistyped = number.replace(/.$/, (last) => (last === 'A' ? 'B' : 'A'));
    expect(verifyMembershipSchema.safeParse({ number: mistyped }).success).toBe(
      false,
    );
    expect(verifyMembershipSchema.safeParse({ number: '' }).success).toBe(
      false,
    );
  });
});

describe('vehicle letter reissue request (VEH-27)', () => {
  it('requires a reason', () => {
    expect(reissueVehicleLetterSchema.safeParse({}).success).toBe(false);
    expect(
      reissueVehicleLetterSchema.safeParse({ reason: ' ok ' }).success,
    ).toBe(false);
    expect(
      reissueVehicleLetterSchema.safeParse({ reason: 'Driver linked' }).success,
    ).toBe(true);
  });
});
