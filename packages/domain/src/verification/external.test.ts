import { describe, expect, it } from 'vitest';

import {
  EXTERNAL_CHECKS,
  EXTERNAL_CHECK_FIELDS,
  EXTERNAL_RECORD_TYPES,
  externalCheckFields,
  externalLimitation,
  externalStatement,
} from './external.js';
import { VERIFICATION_FIELDS } from './projection.js';

const VEHICLE_FIELDS = [
  'plate_number',
  'vehicle_category',
  'sticker_status',
  'attached_at',
  'plate_matches_sticker',
];
const MEMBERSHIP_FIELDS = ['membership_status', 'card_status', 'designation'];

describe('the external checks (item 12)', () => {
  it('carry only external-admissible fields', () => {
    for (const check of EXTERNAL_CHECKS) {
      for (const field of EXTERNAL_CHECK_FIELDS[check]) {
        expect(VERIFICATION_FIELDS[field], `${check}: ${field}`).toBe(
          'EXTERNAL',
        );
      }
    }
  });

  it('never tell a sticker check the plate (proposal §10.2)', () => {
    expect(EXTERNAL_CHECK_FIELDS.STICKER).not.toContain('plate_number');
  });

  it('keep vehicles and members apart', () => {
    for (const check of ['PLATE', 'STICKER', 'COMBINED'] as const) {
      for (const field of MEMBERSHIP_FIELDS) {
        expect(EXTERNAL_CHECK_FIELDS[check]).not.toContain(field);
      }
    }
    for (const field of VEHICLE_FIELDS) {
      expect(EXTERNAL_CHECK_FIELDS.MEMBERSHIP).not.toContain(field);
    }
  });

  it('say whether the sticker belongs to the plate only when both were presented', () => {
    expect(EXTERNAL_CHECK_FIELDS.COMBINED).toContain('plate_matches_sticker');
    expect(EXTERNAL_CHECK_FIELDS.PLATE).not.toContain('plate_matches_sticker');
    expect(EXTERNAL_CHECK_FIELDS.STICKER).not.toContain(
      'plate_matches_sticker',
    );
  });

  it('name no record after declaration (Requirement 12.7)', () => {
    expect(EXTERNAL_RECORD_TYPES.PLATE).toBe('NURTW_VEHICLE');
    for (const check of EXTERNAL_CHECKS) {
      expect(EXTERNAL_RECORD_TYPES[check]).not.toMatch(/DECLAR/);
    }
  });

  it('project the fields the check may carry that the profile permits', () => {
    expect(
      externalCheckFields('PLATE', [
        'vehicle_category',
        'plate_number',
        'membership_status',
        'declaration_status',
        'owner_phone',
      ]),
    ).toEqual(['plate_number', 'vehicle_category']);
    expect(
      externalCheckFields('STICKER', ['plate_number', 'sticker_status']),
    ).toEqual(['sticker_status']);
    expect(externalCheckFields('MEMBERSHIP', [])).toEqual([]);
  });

  it('answer every non-match of a check in the same words', () => {
    for (const check of EXTERNAL_CHECKS) {
      expect(externalStatement(check, false)).toBe(
        externalStatement('PLATE', false),
      );
      expect(externalStatement(check, true)).toMatch(
        /^A matching NURTW .* record was found/,
      );
      expect(externalLimitation(check)).toMatch(/^A match confirms only/);
    }
    expect(externalStatement('MEMBERSHIP', true)).toMatch(/membership record/);
  });
});
