import { describe, expect, it } from 'vitest';

import {
  applicantConfirmationSchema,
  approveApiClientSchema,
  createInvitationSchema,
  createPortalAccountSchema,
  portalApplicationSchema,
  portalChangePasswordSchema,
  portalLoginSchema,
  resetPortalPasswordSchema,
  withdrawInvitationSchema,
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

describe('inviting an organisation (item 33)', () => {
  it('needs only the name, and trims what was typed', () => {
    expect(
      createInvitationSchema.parse({ organisationName: ' Road Agency ' }),
    ).toEqual({ organisationName: 'Road Agency' });
  });

  it('lower-cases a contact address, and refuses one that is not an address', () => {
    expect(
      createInvitationSchema.parse({
        organisationName: 'Road Agency',
        contactEmail: ' Desk@Agency.Example ',
      }).contactEmail,
    ).toBe('desk@agency.example');
    expect(
      createInvitationSchema.safeParse({
        organisationName: 'Road Agency',
        contactEmail: 'not an address',
      }).success,
    ).toBe(false);
  });

  it('carries no access, and no code, whatever is sent', () => {
    const parsed = createInvitationSchema.parse({
      organisationName: 'Road Agency',
      code: 'abcdefghijklmnopqrstuv',
      expiresAt: '2099-01-01T00:00:00.000Z',
      scopes: ['vehicle:verify:plate'],
      status: 'ACTIVE',
    });
    expect(Object.keys(parsed)).toEqual(['organisationName']);
  });

  it('withdraws only with a reason', () => {
    expect(withdrawInvitationSchema.safeParse({ reason: 'no' }).success).toBe(
      false,
    );
    expect(
      withdrawInvitationSchema.parse({ reason: ' Sent to the wrong desk ' }),
    ).toEqual({ reason: 'Sent to the wrong desk' });
  });

  it('lets an application carry an invitation’s code, and nothing else of it', () => {
    const parsed = portalApplicationSchema.parse({
      ...APPLICATION,
      invitationCode: ' abcdefghijklmnopqrstuv ',
    });
    expect(parsed.invitationCode).toBe('abcdefghijklmnopqrstuv');
  });
});
