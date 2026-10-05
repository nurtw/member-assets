import { describe, expect, it } from 'vitest';

import {
  applicantConfirmationSchema,
  approveApiClientSchema,
  createPortalAccountSchema,
  portalApplicationSchema,
  portalChangePasswordSchema,
  portalLoginSchema,
  resetPortalPasswordSchema,
} from './index.js';

const APPLICATION = {
  organisationName: ' Anambra Road Agency ',
  businessPurpose: 'Roadside checks of vehicles by our officers.',
  contactName: 'Ngozi Eze',
  email: ' Ngozi.Eze@Agency.Example ',
  phone: '+234 800 000 0000',
  password: 'a-long-phrase-for-the-portal',
};

describe('an application to the portal (item 29)', () => {
  it('trims what was typed and lower-cases the address', () => {
    const parsed = portalApplicationSchema.parse(APPLICATION);
    expect(parsed.organisationName).toBe('Anambra Road Agency');
    expect(parsed.email).toBe('ngozi.eze@agency.example');
  });

  it('carries nothing about access, whatever is sent', () => {
    const parsed = portalApplicationSchema.parse({
      ...APPLICATION,
      status: 'ACTIVE',
      scopes: ['vehicle:verify:plate'],
      disclosureProfileId: '7d1f0c2e-1b2a-4c3d-8e4f-5a6b7c8d9e0f',
      rateLimitProfile: 'TRUSTED',
      selfRegistered: false,
    });
    expect(Object.keys(parsed).sort()).toEqual(
      [
        'businessPurpose',
        'contactName',
        'email',
        'organisationName',
        'password',
        'phone',
      ].sort(),
    );
  });

  it('needs a telephone number, since the applicant is confirmed by telephone', () => {
    const { phone: _phone, ...rest } = APPLICATION;
    expect(portalApplicationSchema.safeParse(rest).success).toBe(false);
    expect(
      portalApplicationSchema.safeParse({ ...APPLICATION, phone: '12' })
        .success,
    ).toBe(false);
  });

  it('needs a password of twelve characters, and a purpose', () => {
    expect(
      portalApplicationSchema.safeParse({
        ...APPLICATION,
        password: 'too-short',
      }).success,
    ).toBe(false);
    expect(
      portalApplicationSchema.safeParse({
        ...APPLICATION,
        businessPurpose: 'API',
      }).success,
    ).toBe(false);
  });
});

describe('signing in to the portal', () => {
  it('checks shape only, and lower-cases the address', () => {
    expect(
      portalLoginSchema.parse({ email: ' A@B.Example ', password: 'x' }),
    ).toEqual({ email: 'a@b.example', password: 'x' });
    expect(
      portalLoginSchema.safeParse({ email: 'not an address', password: 'x' })
        .success,
    ).toBe(false);
  });

  it('changes a password only to one of twelve characters', () => {
    expect(
      portalChangePasswordSchema.safeParse({
        currentPassword: 'whatever-it-was',
        newPassword: 'short',
      }).success,
    ).toBe(false);
  });
});

describe('the administrator’s side of the portal', () => {
  it('confirms an applicant by telephone or by letter, and no other way', () => {
    expect(
      applicantConfirmationSchema.safeParse({ via: 'TELEPHONE' }).success,
    ).toBe(true);
    expect(
      applicantConfirmationSchema.safeParse({ via: 'LETTER', note: 'Ref 14' })
        .success,
    ).toBe(true);
    expect(
      applicantConfirmationSchema.safeParse({ via: 'EMAIL' }).success,
    ).toBe(false);
  });

  it('lets an approval carry the confirmation', () => {
    const parsed = approveApiClientSchema.parse({
      disclosureProfileId: '7d1f0c2e-1b2a-4c3d-8e4f-5a6b7c8d9e0f',
      scopes: ['vehicle:verify:plate'],
      agreementReference: 'DSA/2026/029',
      agreementDate: '2026-09-01',
      applicantConfirmation: { via: 'TELEPHONE' },
    });
    expect(parsed.applicantConfirmation).toEqual({ via: 'TELEPHONE' });
  });

  it('gives an account by name and address, and resets one only with a reason', () => {
    expect(
      createPortalAccountSchema.parse({
        email: 'Contact@Agency.Example',
        fullName: ' Ngozi Eze ',
        password: 'never accepted from the administrator',
      }),
    ).toEqual({ email: 'contact@agency.example', fullName: 'Ngozi Eze' });
    expect(resetPortalPasswordSchema.safeParse({ reason: ' ' }).success).toBe(
      false,
    );
    expect(
      resetPortalPasswordSchema.safeParse({ reason: 'Password forgotten' })
        .success,
    ).toBe(true);
  });
});
