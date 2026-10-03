import {
  EXTERNAL_VERIFICATION_FIELDS,
  VERIFICATION_FIELDS,
  VERIFICATION_FIELD_NAMES,
  projectVerification,
  type VerificationValues,
} from '@nurtw/domain';
import { describe, expect, it } from 'vitest';

import {
  API_SCOPES,
  API_SCOPE_DESCRIPTIONS,
  DEFAULT_TOKEN_EXPIRY_DAYS,
  DEFAULT_TOKEN_REMINDER_DAYS,
  DISCLOSURE_FIELD_LABELS,
  SYSTEM_DISCLOSURE_PROFILES,
  apiScopeSchema,
  approveApiClientSchema,
  createDisclosureProfileSchema,
  isApiScope,
  registerApiClientSchema,
  revokeApiTokenSchema,
  rotateApiTokenSchema,
  setApiClientAccessSchema,
  setApiClientStatusSchema,
  updateApiClientSchema,
  updateDisclosureProfileSchema,
} from './index.js';

const PROFILE_ID = '8f3e0d9e-7f5c-4e0c-a4b1-5b9a0fcb6b5e';

const registration = {
  organisationName: 'Example Insurance Ltd',
  businessPurpose:
    'Confirming that an insured vehicle carries a Union sticker.',
  technicalContact: { name: 'Ada Obi', email: 'ada@example.test' },
};

const approval = {
  disclosureProfileId: PROFILE_ID,
  scopes: ['vehicle:verify:plate'],
  agreementReference: 'DSA/2026/014',
  agreementDate: '2026-10-01',
};

describe('scopes (item 11)', () => {
  it('describes every scope', () => {
    expect(Object.keys(API_SCOPE_DESCRIPTIONS).sort()).toEqual(
      [...API_SCOPES].sort(),
    );
    for (const scope of API_SCOPES) {
      expect(API_SCOPE_DESCRIPTIONS[scope].length).toBeGreaterThan(10);
    }
  });

  it('cannot name a broad scope, so one cannot be granted (Requirement 12.4)', () => {
    for (const scope of [
      'database:read',
      'member:read:all',
      '*',
      'admin',
      'vehicle:verify:*',
      'VEHICLE:VERIFY:PLATE',
      '',
    ]) {
      expect(apiScopeSchema.safeParse(scope).success).toBe(false);
      expect(isApiScope(scope)).toBe(false);
    }
    expect(apiScopeSchema.safeParse('vehicle:verify:plate').success).toBe(true);
  });

  it('seeds the determined token lifetime and a reminder inside it', () => {
    expect(DEFAULT_TOKEN_EXPIRY_DAYS).toBe(90); // PRD §23.12
    expect(DEFAULT_TOKEN_REMINDER_DAYS).toBeLessThan(DEFAULT_TOKEN_EXPIRY_DAYS);
  });
});

describe('registering an organisation', () => {
  it('takes the organisation, its purpose, and a contact', () => {
    const parsed = registerApiClientSchema.parse(registration);
    expect(parsed.allowedIpRanges).toEqual([]);
    expect(parsed.technicalContact.email).toBe('ada@example.test');
  });

  it('strips anything that would approve it or grant it access', () => {
    const parsed = registerApiClientSchema.parse({
      ...registration,
      status: 'ACTIVE',
      scopes: ['vehicle:verify:plate'],
      disclosureProfileId: PROFILE_ID,
      approvedByUserId: PROFILE_ID,
    });
    expect(parsed).not.toHaveProperty('status');
    expect(parsed).not.toHaveProperty('scopes');
    expect(parsed).not.toHaveProperty('disclosureProfileId');
    expect(parsed).not.toHaveProperty('approvedByUserId');
  });

  it('needs a contact email, since that is where a reminder goes', () => {
    expect(
      registerApiClientSchema.safeParse({
        ...registration,
        technicalContact: { name: 'Ada Obi', email: 'not-an-email' },
      }).success,
    ).toBe(false);
  });

  it('accepts addresses and ranges, and refuses anything else', () => {
    expect(
      registerApiClientSchema.parse({
        ...registration,
        allowedIpRanges: [
          '203.0.113.0/24',
          ' 2001:db8::/32 ',
          '203.0.113.0/24',
        ],
      }).allowedIpRanges,
    ).toEqual(['203.0.113.0/24', '2001:db8::/32']);

    for (const range of ['example.org', '203.0.113.0/33', '0.0.0.0/0', '']) {
      expect(
        registerApiClientSchema.safeParse({
          ...registration,
          allowedIpRanges: [range],
        }).success,
      ).toBe(false);
    }
  });
});

describe('approving an organisation', () => {
  it('needs a profile, a scope, and a data-sharing agreement (EXT-07)', () => {
    expect(approveApiClientSchema.safeParse(approval).success).toBe(true);

    for (const missing of [
      'disclosureProfileId',
      'scopes',
      'agreementReference',
      'agreementDate',
    ] as const) {
      const body: Record<string, unknown> = { ...approval };
      delete body[missing];
      expect(approveApiClientSchema.safeParse(body).success).toBe(false);
    }
  });

  it('refuses no scope, an unknown scope, and a broad one', () => {
    for (const scopes of [
      [],
      ['database:read'],
      ['vehicle:verify:plate', '*'],
    ]) {
      expect(
        approveApiClientSchema.safeParse({ ...approval, scopes }).success,
      ).toBe(false);
    }
  });

  it('grants each scope once', () => {
    expect(
      approveApiClientSchema.parse({
        ...approval,
        scopes: ['vehicle:verify:plate', 'vehicle:verify:plate'],
      }).scopes,
    ).toEqual(['vehicle:verify:plate']);
  });

  it('refuses a blank agreement reference or a date that is not one', () => {
    expect(
      approveApiClientSchema.safeParse({ ...approval, agreementReference: ' ' })
        .success,
    ).toBe(false);
    for (const agreementDate of ['1 October 2026', '2026-13-01', '']) {
      expect(
        approveApiClientSchema.safeParse({ ...approval, agreementDate })
          .success,
      ).toBe(false);
    }
  });
});

describe('amending an organisation', () => {
  it('needs a reason and something to change', () => {
    expect(
      updateApiClientSchema.safeParse({ organisationName: 'Example Ltd' })
        .success,
    ).toBe(false);
    expect(
      updateApiClientSchema.safeParse({ reason: 'Renamed at Companies House' })
        .success,
    ).toBe(false);
    expect(
      updateApiClientSchema.safeParse({
        organisationName: 'Example Ltd',
        reason: 'Renamed at Companies House',
      }).success,
    ).toBe(true);
  });

  it('cannot change the access the approval granted', () => {
    const parsed = updateApiClientSchema.parse({
      allowedIpRanges: [],
      scopes: ['aggregate:vehicles:read'],
      disclosureProfileId: PROFILE_ID,
      status: 'ACTIVE',
      reason: 'Moved data centre',
    });
    expect(parsed).not.toHaveProperty('scopes');
    expect(parsed).not.toHaveProperty('disclosureProfileId');
    expect(parsed).not.toHaveProperty('status');
  });

  it('changes access only with a reason', () => {
    const access = {
      disclosureProfileId: PROFILE_ID,
      scopes: ['vehicle:verify:plate'],
    };
    expect(setApiClientAccessSchema.safeParse(access).success).toBe(false);
    expect(
      setApiClientAccessSchema.safeParse({ ...access, reason: 'Scope reduced' })
        .success,
    ).toBe(true);
  });

  it('sets only the statuses an officer decides', () => {
    for (const status of ['ACTIVE', 'SUSPENDED', 'REVOKED']) {
      expect(
        setApiClientStatusSchema.safeParse({ status, reason: 'As directed' })
          .success,
      ).toBe(true);
    }
    for (const status of ['PENDING', 'EXPIRED', 'DELETED']) {
      expect(
        setApiClientStatusSchema.safeParse({ status, reason: 'As directed' })
          .success,
      ).toBe(false);
    }
    expect(
      setApiClientStatusSchema.safeParse({ status: 'REVOKED' }).success,
    ).toBe(false);
  });
});

describe('tokens', () => {
  it('rotates with one of the four overlaps (EXT-11)', () => {
    for (const overlap of ['NONE', 'ONE_HOUR', 'ONE_DAY', 'SEVEN_DAYS']) {
      expect(rotateApiTokenSchema.safeParse({ overlap }).success).toBe(true);
    }
    for (const overlap of ['THIRTY_DAYS', 'FOREVER', '', 3600]) {
      expect(rotateApiTokenSchema.safeParse({ overlap }).success).toBe(false);
    }
    expect(rotateApiTokenSchema.safeParse({}).success).toBe(false);
  });

  it('revokes only with a reason', () => {
    expect(revokeApiTokenSchema.safeParse({}).success).toBe(false);
    expect(
      revokeApiTokenSchema.safeParse({ reason: 'Token pasted into a ticket' })
        .success,
    ).toBe(true);
  });
});

describe('disclosure profiles (PRD §15)', () => {
  /** A value for every catalogue field, so anything projected is visible. */
  const values = Object.fromEntries(
    VERIFICATION_FIELD_NAMES.map((field) => [field, `value of ${field}`]),
  ) as unknown as VerificationValues;

  it('seeds the four profiles an outside organisation can hold', () => {
    expect(SYSTEM_DISCLOSURE_PROFILES.map((profile) => profile.code)).toEqual([
      'MINIMAL_VERIFICATION',
      'OPERATIONAL_VERIFICATION',
      'MEMBERSHIP_VERIFICATION',
      'AGGREGATE_REPORTING',
    ]);
  });

  it('never seeds the internal profile as a row an organisation could hold', () => {
    for (const profile of SYSTEM_DISCLOSURE_PROFILES) {
      expect(profile.code).not.toMatch(/INTERNAL/);
      for (const field of profile.fields) {
        expect(VERIFICATION_FIELDS[field]).toBe('EXTERNAL');
      }
    }
  });

  it('projects each seeded profile to exactly its own fields (criterion 6)', () => {
    for (const profile of SYSTEM_DISCLOSURE_PROFILES) {
      expect(
        Object.keys(projectVerification(values, profile.fields, 'EXTERNAL')),
        profile.code,
      ).toEqual(
        EXTERNAL_VERIFICATION_FIELDS.filter((field) =>
          (profile.fields as readonly string[]).includes(field),
        ),
      );
    }
    const [minimal] = SYSTEM_DISCLOSURE_PROFILES;
    expect(projectVerification(values, minimal.fields, 'EXTERNAL')).toEqual({});
  });

  it('labels the external tier, the whole of it, and nothing more', () => {
    expect(Object.keys(DISCLOSURE_FIELD_LABELS).sort()).toEqual(
      [...EXTERNAL_VERIFICATION_FIELDS].sort(),
    );
  });

  it('composes a profile from external-admissible fields', () => {
    const parsed = createDisclosureProfileSchema.parse({
      code: 'INSURER_STANDARD',
      label: 'Insurer standard',
      fields: ['vehicle_category', 'attached_at', 'vehicle_category'],
    });
    expect(parsed.fields).toEqual(['vehicle_category', 'attached_at']);
  });

  it('refuses a field no outside organisation may be told', () => {
    for (const field of [
      'declaration_status',
      'member_name',
      'membership_number',
      'vehicle_id',
      'registered_plate',
      'owner_phone',
      'chassis_vin_restricted',
      '__proto__',
    ]) {
      expect(
        createDisclosureProfileSchema.safeParse({
          code: 'TOO_MUCH',
          label: 'Too much',
          fields: ['vehicle_category', field],
        }).success,
        field,
      ).toBe(false);
    }
  });

  it('takes a code that will read the same in every record', () => {
    for (const code of ['insurer', 'A', '1ST', 'HAS SPACE', 'HAS-DASH']) {
      expect(
        createDisclosureProfileSchema.safeParse({
          code,
          label: 'X profile',
          fields: [],
        }).success,
      ).toBe(false);
    }
  });

  it('amends only with a reason and something to change', () => {
    expect(
      updateDisclosureProfileSchema.safeParse({ fields: ['vehicle_category'] })
        .success,
    ).toBe(false);
    expect(
      updateDisclosureProfileSchema.safeParse({
        reason: 'Agreed with the Union',
      }).success,
    ).toBe(false);
    expect(
      updateDisclosureProfileSchema.safeParse({
        fields: [],
        reason: 'Agreed with the Union',
      }).success,
    ).toBe(true);
    expect(
      updateDisclosureProfileSchema.safeParse({
        fields: ['declaration_status'],
        reason: 'Agreed with the Union',
      }).success,
    ).toBe(false);
  });

  it('cannot be made a system profile, or have its code changed, by a body', () => {
    const created = createDisclosureProfileSchema.parse({
      code: 'INSURER_STANDARD',
      label: 'Insurer standard',
      fields: [],
      isSystem: true,
    });
    expect(created).not.toHaveProperty('isSystem');
    const updated = updateDisclosureProfileSchema.parse({
      label: 'Insurer',
      code: 'MINIMAL_VERIFICATION',
      isSystem: true,
      reason: 'Renamed',
    });
    expect(updated).not.toHaveProperty('code');
    expect(updated).not.toHaveProperty('isSystem');
  });
});
