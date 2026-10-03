import { describe, expect, it } from 'vitest';

import {
  EXTERNAL_VERIFICATION_FIELDS,
  VERIFICATION_FIELDS,
  VERIFICATION_FIELD_NAMES,
  isExternalVerificationField,
  projectVerification,
  type VerificationField,
  type VerificationValues,
} from './projection.js';

/** A value for every catalogue field, each distinct, so a leak is visible. */
function values(): VerificationValues {
  return {
    plate_number: 'AA-123-XY',
    vehicle_category: 'Shuttle bus',
    sticker_status: 'ACTIVE',
    organizational_unit: 'Unit 4',
    attached_at: '2026-10-01T09:00:00.000Z',
    plate_matches_sticker: true,
    membership_status: 'ACTIVE',
    card_status: 'ACTIVE',
    designation: 'Driver',
    declaration_status: 'ACTIVE',
    onboarded_at: '2026-10-01T09:00:00.000Z',
    identifier_scheme: 'SIGNED',
    registered_plate: 'AA123XY',
    sticker_plate: 'AA-123-XY',
    make: 'Toyota',
    model: 'Hiace',
    color: 'White',
    route_type: 'Intercity',
    vehicle_id: 'vehicle-1',
    member_name: 'Ada Obi',
    membership_number: 'NUR-0001',
    member_status: 'ACTIVE',
    card_number: 'CARD-0001',
    card_expiry_date: '2027-10-01T00:00:00.000Z',
  };
}

const EXTERNAL = VERIFICATION_FIELD_NAMES.filter(
  (field) => VERIFICATION_FIELDS[field] === 'EXTERNAL',
);

/**
 * The record fields of the PRD §15 profiles, as item 11 seeds them
 * (`SYSTEM_DISCLOSURE_PROFILES` in `@nurtw/contracts`, which this package
 * cannot import). The internal profile is not a row: it is every field, cut
 * down by the officer's permissions.
 */
const PROFILES: Record<string, readonly VerificationField[]> = {
  minimal: [],
  operational: [
    'plate_number',
    'vehicle_category',
    'sticker_status',
    'organizational_unit',
  ],
  membership: ['membership_status', 'card_status'],
  internal: VERIFICATION_FIELD_NAMES,
};

/** A small deterministic generator, so a failing subset can be replayed. */
function* subsets(count: number): Generator<VerificationField[]> {
  let seed = 0x5eed;
  for (let i = 0; i < count; i++) {
    const subset: VerificationField[] = [];
    for (const field of VERIFICATION_FIELD_NAMES) {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      if (seed % 2 === 0) {
        subset.push(field);
      }
    }
    yield subset;
  }
}

describe('projectVerification (ARCHITECTURE.md Decision 5.3)', () => {
  it('outputs exactly the permitted fields on the internal channel, in catalogue order', () => {
    const projected = projectVerification(
      values(),
      ['member_name', 'plate_number', 'declaration_status'],
      'INTERNAL',
    );
    expect(Object.keys(projected)).toEqual([
      'plate_number',
      'declaration_status',
      'member_name',
    ]);
    expect(projected).toEqual({
      plate_number: 'AA-123-XY',
      declaration_status: 'ACTIVE',
      member_name: 'Ada Obi',
    });
  });

  it('keeps a permitted field whose value is null, so its absence is stated', () => {
    expect(
      projectVerification(
        { ...values(), plate_number: null },
        ['plate_number'],
        'INTERNAL',
      ),
    ).toEqual({ plate_number: null });
  });

  it('never outputs an internal-only field externally, even when a profile permits it', () => {
    const projected = projectVerification(
      values(),
      VERIFICATION_FIELD_NAMES,
      'EXTERNAL',
    );
    expect(Object.keys(projected)).toEqual(EXTERNAL);
    // PRD Requirement 12.7: nothing naming declaration reaches an outside party.
    expect(JSON.stringify(projected)).not.toMatch(/declar/i);
  });

  it('ignores a permitted name the catalogue does not know', () => {
    expect(
      projectVerification(
        values(),
        [
          'owner_phone',
          'chassis_vin_restricted',
          '__proto__',
          'vehicle_category',
        ],
        'INTERNAL',
      ),
    ).toEqual({ vehicle_category: 'Shuttle bus' });
  });

  it('never copies a value the catalogue does not name — a field added later stays withheld', () => {
    const widened = {
      ...values(),
      owner_phone: '+2348000000000',
      notes: 'internal note',
    } as VerificationValues;
    const projected = projectVerification(
      widened,
      [...VERIFICATION_FIELD_NAMES, 'owner_phone', 'notes'],
      'INTERNAL',
    );
    expect(projected).not.toHaveProperty('owner_phone');
    expect(projected).not.toHaveProperty('notes');
  });

  it('projects every PRD §15 profile to exactly its own fields, on both channels', () => {
    for (const [name, fields] of Object.entries(PROFILES)) {
      for (const channel of ['INTERNAL', 'EXTERNAL'] as const) {
        const expected = VERIFICATION_FIELD_NAMES.filter(
          (field) =>
            fields.includes(field) &&
            (channel === 'INTERNAL' ||
              VERIFICATION_FIELDS[field] === 'EXTERNAL'),
        );
        expect(
          Object.keys(projectVerification(values(), fields, channel)),
          `${name} on ${channel}`,
        ).toEqual(expected);
      }
    }
  });

  it('holds for any permitted set: output ⊆ permitted ∩ catalogue, external ⊆ external tier', () => {
    // Violations are collected and asserted once: two thousand rounds of
    // `expect` outran the default timeout on a loaded machine.
    const violations: string[] = [];
    for (const subset of subsets(2_000)) {
      const allowed = new Set<string>(subset);
      const internal = Object.keys(
        projectVerification(values(), subset, 'INTERNAL'),
      );
      const expected = VERIFICATION_FIELD_NAMES.filter((field) =>
        allowed.has(field),
      );
      if (internal.join() !== expected.join()) {
        violations.push(`internal ${subset.join()} -> ${internal.join()}`);
      }
      for (const field of Object.keys(
        projectVerification(values(), subset, 'EXTERNAL'),
      )) {
        if (
          !allowed.has(field) ||
          VERIFICATION_FIELDS[field as VerificationField] !== 'EXTERNAL'
        ) {
          violations.push(`external ${subset.join()} -> ${field}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('the verification field catalogue', () => {
  it('names no field that could carry restricted data (acceptance criterion 12, Requirement 27.8)', () => {
    for (const field of VERIFICATION_FIELD_NAMES) {
      expect(field).not.toMatch(
        /phone|address|kin|guarantor|collateral|chassis|vin|signature|note|owner|passport|photo|dues|payment|levy|fee/,
      );
    }
  });

  it('admits externally only what PRD §15 and §23.14 allow', () => {
    expect(EXTERNAL).toEqual([
      'plate_number',
      'vehicle_category',
      'sticker_status',
      'organizational_unit',
      'attached_at',
      'plate_matches_sticker',
      'membership_status',
      'card_status',
      'designation',
    ]);
  });

  it('offers a disclosure profile the external tier and nothing else (item 11)', () => {
    expect(EXTERNAL_VERIFICATION_FIELDS).toEqual(EXTERNAL);
    for (const field of VERIFICATION_FIELD_NAMES) {
      expect(isExternalVerificationField(field)).toBe(
        VERIFICATION_FIELDS[field] === 'EXTERNAL',
      );
    }
    expect(isExternalVerificationField('owner_phone')).toBe(false);
    expect(isExternalVerificationField('__proto__')).toBe(false);
  });
});
