import { describe, expect, it } from 'vitest';

import { STICKER_STATUSES } from '../sticker/status.js';
import { DECLARATION_STATUSES } from '../vehicle/status.js';
import {
  MATCH_STATEMENTS,
  NOT_VERIFIED_REASONS,
  NO_MATCH_STATEMENT,
  VERIFICATION_LIMITATION,
  decideVerification,
  discloseReasons,
  type VerificationSticker,
  type VerificationVehicle,
} from './verdict.js';

function vehicle(
  overrides: Partial<VerificationVehicle> = {},
): VerificationVehicle {
  return {
    declarationStatus: 'ACTIVE',
    plateNumberNormalized: 'AA123XY',
    onboarded: true,
    ...overrides,
  };
}

function sticker(
  overrides: Partial<VerificationSticker> = {},
): VerificationSticker {
  return {
    status: 'ACTIVE',
    attached: true,
    registeredPlateNormalized: null,
    ...overrides,
  };
}

describe('decideVerification — by plate', () => {
  it('matches a declared, onboarded vehicle', () => {
    expect(
      decideVerification({ criteria: 'PLATE', vehicle: vehicle() }),
    ).toEqual({
      matched: true,
      reasons: [],
    });
  });

  it('reports no record when nothing is on record for the plate', () => {
    expect(decideVerification({ criteria: 'PLATE', vehicle: null })).toEqual({
      matched: false,
      reasons: ['NO_RECORD'],
    });
  });

  it('gives both reasons for a legacy vehicle on record only (VEH-22)', () => {
    expect(
      decideVerification({
        criteria: 'PLATE',
        vehicle: vehicle({ declarationStatus: 'ON_RECORD', onboarded: false }),
      }),
    ).toEqual({ matched: false, reasons: ['NOT_DECLARED', 'NOT_ONBOARDED'] });
  });

  it('refuses a vehicle that is onboarded but not declared, and the reverse', () => {
    expect(
      decideVerification({
        criteria: 'PLATE',
        vehicle: vehicle({ declarationStatus: 'ON_RECORD' }),
      }).reasons,
    ).toEqual(['NOT_DECLARED']);
    expect(
      decideVerification({
        criteria: 'PLATE',
        vehicle: vehicle({ onboarded: false }),
      }).reasons,
    ).toEqual(['NOT_ONBOARDED']);
  });

  it('matches only an ACTIVE declaration, whatever else the status is', () => {
    for (const declarationStatus of DECLARATION_STATUSES) {
      const result = decideVerification({
        criteria: 'PLATE',
        vehicle: vehicle({ declarationStatus }),
      });
      expect(result.matched).toBe(declarationStatus === 'ACTIVE');
    }
  });
});

describe('decideVerification — by sticker', () => {
  it('matches an attached ACTIVE sticker on a declared vehicle', () => {
    expect(
      decideVerification({
        criteria: 'STICKER',
        codeValid: true,
        sticker: sticker(),
        vehicle: vehicle(),
      }),
    ).toEqual({ matched: true, reasons: [] });
  });

  it('gives only INVALID_CODE for a code that failed its signature', () => {
    // Nothing was looked up, so nothing else can be said (Requirement 26.1).
    expect(
      decideVerification({
        criteria: 'STICKER',
        codeValid: false,
        sticker: null,
        vehicle: null,
      }),
    ).toEqual({ matched: false, reasons: ['INVALID_CODE'] });
  });

  it('reports no record for a valid code nothing answers to', () => {
    expect(
      decideVerification({
        criteria: 'STICKER',
        codeValid: true,
        sticker: null,
        vehicle: null,
      }).reasons,
    ).toEqual(['NO_RECORD']);
  });

  it('refuses an unattached sticker, signed or legacy (Requirement 10.3)', () => {
    for (const registeredPlateNormalized of [null, 'AA123XY']) {
      expect(
        decideVerification({
          criteria: 'STICKER',
          codeValid: true,
          sticker: sticker({
            attached: false,
            status: 'ISSUED',
            registeredPlateNormalized,
          }),
          vehicle: null,
        }).reasons,
      ).toEqual(['STICKER_NOT_ATTACHED']);
    }
  });

  it('matches only an ACTIVE sticker — a signature is never sufficient (Requirement 26.3)', () => {
    for (const status of STICKER_STATUSES) {
      const result = decideVerification({
        criteria: 'STICKER',
        codeValid: true,
        sticker: sticker({ status }),
        vehicle: vehicle(),
      });
      expect(result.matched).toBe(status === 'ACTIVE');
      if (status !== 'ACTIVE') {
        expect(result.reasons).toEqual(['STICKER_NOT_ACTIVE']);
      }
    }
  });

  it('refuses an ACTIVE sticker on a vehicle that is not declared', () => {
    expect(
      decideVerification({
        criteria: 'STICKER',
        codeValid: true,
        sticker: sticker({ status: 'SUSPENDED' }),
        vehicle: vehicle({ declarationStatus: 'ON_RECORD' }),
      }).reasons,
    ).toEqual(['STICKER_NOT_ACTIVE', 'NOT_DECLARED']);
  });
});

describe('decideVerification — plate and sticker together', () => {
  const presentedPlate = 'AA123XY';

  it('matches a sticker attached to the vehicle carrying the presented plate', () => {
    expect(
      decideVerification({
        criteria: 'COMBINED',
        codeValid: true,
        presentedPlate,
        sticker: sticker(),
        vehicle: vehicle(),
      }),
    ).toEqual({ matched: true, reasons: [] });
  });

  it('reports a mismatch for a genuine sticker on another vehicle (PRD §26.3)', () => {
    expect(
      decideVerification({
        criteria: 'COMBINED',
        codeValid: true,
        presentedPlate: 'BB456ZZ',
        sticker: sticker(),
        vehicle: vehicle(),
      }),
    ).toEqual({ matched: false, reasons: ['PLATE_MISMATCH'] });
  });

  it('puts the mismatch before every other state', () => {
    expect(
      decideVerification({
        criteria: 'COMBINED',
        codeValid: true,
        presentedPlate: 'BB456ZZ',
        sticker: sticker({ status: 'LOST' }),
        vehicle: vehicle({ declarationStatus: 'SUSPENDED' }),
      }).reasons,
    ).toEqual(['PLATE_MISMATCH', 'STICKER_NOT_ACTIVE', 'NOT_DECLARED']);
  });

  it('catches a Transpay barcode presented for a plate other than its registered one', () => {
    expect(
      decideVerification({
        criteria: 'COMBINED',
        codeValid: true,
        presentedPlate: 'BB456ZZ',
        sticker: sticker({
          attached: false,
          status: 'ISSUED',
          registeredPlateNormalized: 'AA123XY',
        }),
        vehicle: null,
      }).reasons,
    ).toEqual(['PLATE_MISMATCH', 'STICKER_NOT_ATTACHED']);
  });

  it('reports only not-attached for a Transpay barcode presented for its own plate', () => {
    expect(
      decideVerification({
        criteria: 'COMBINED',
        codeValid: true,
        presentedPlate,
        sticker: sticker({
          attached: false,
          status: 'ISSUED',
          registeredPlateNormalized: presentedPlate,
        }),
        vehicle: null,
      }).reasons,
    ).toEqual(['STICKER_NOT_ATTACHED']);
  });

  it('gives only INVALID_CODE for a forged code, whatever plate came with it', () => {
    expect(
      decideVerification({
        criteria: 'COMBINED',
        codeValid: false,
        presentedPlate,
        sticker: null,
        vehicle: null,
      }).reasons,
    ).toEqual(['INVALID_CODE']);
  });
});

describe('verdict copy (PRD Requirement 11.1, §22)', () => {
  it('states the matter verified, with the wording the PRD requires', () => {
    for (const statement of Object.values(MATCH_STATEMENTS)) {
      expect(statement).toMatch(
        /^A matching NURTW .+ record was found under the requested verification criteria\.$/,
      );
    }
    expect(NO_MATCH_STATEMENT).toContain(
      'under the requested verification criteria',
    );
  });

  it('never asserts ownership, roadworthiness, licensing, or insurance', () => {
    const affirmations = [
      ...Object.values(MATCH_STATEMENTS),
      NO_MATCH_STATEMENT,
    ];
    for (const statement of affirmations) {
      expect(statement.toLowerCase()).not.toMatch(
        /owner|roadworth|licen[cs]|insur|genuine|certif/,
      );
    }
    // The limitation names them only to disclaim them.
    expect(VERIFICATION_LIMITATION).toMatch(/not evidence of ownership/);
  });

  it('keeps the reasons in one fixed order, the headline first', () => {
    expect(NOT_VERIFIED_REASONS[0]).toBe('INVALID_CODE');
    expect(new Set(NOT_VERIFIED_REASONS).size).toBe(
      NOT_VERIFIED_REASONS.length,
    );
  });
});

describe('discloseReasons (QUESTIONS.md VEH-28)', () => {
  const reasons = ['PLATE_MISMATCH', 'NOT_DECLARED', 'NOT_ONBOARDED'] as const;

  it('states every reason to a holder of vehicle.declare', () => {
    expect(discloseReasons(reasons, true)).toEqual(reasons);
  });

  it('never says "not declared" to anyone else, keeping the order', () => {
    expect(discloseReasons(reasons, false)).toEqual([
      'PLATE_MISMATCH',
      'RECORD_INCOMPLETE',
      'NOT_ONBOARDED',
    ]);
  });

  it('leaves a verdict with no declaration reason untouched', () => {
    expect(discloseReasons(['STICKER_NOT_ACTIVE'], false)).toEqual([
      'STICKER_NOT_ACTIVE',
    ]);
  });
});
