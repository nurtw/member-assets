import { describe, expect, it } from 'vitest';

import {
  assignRoleSchema,
  changePasswordSchema,
  createRoleSchema,
  createUserSchema,
  loginSchema,
  reasonSchema,
  scopedPermissionSchema,
  setSecondFactorEnforcementSchema,
  setUserStatusSchema,
  updateRoleSchema,
  updateUserSchema,
} from './index.js';

const ORGANISATION = '7d1f0c2e-1b2a-4c3d-8e4f-5a6b7c8d9e0f';

describe('an officer account (item 28)', () => {
  it('is created from a name and an address, and nothing else', () => {
    const parsed = createUserSchema.parse({
      email: '  Ada.Obi@NURTW.test ',
      fullName: ' Adaeze Obi ',
      password: 'chosen-by-the-administrator',
      isActive: false,
      mustChangePassword: false,
    });
    // The System issues the password; the administrator cannot send one.
    expect(parsed).toEqual({
      email: 'ada.obi@nurtw.test',
      fullName: 'Adaeze Obi',
    });
    expect(
      createUserSchema.safeParse({ email: 'not-an-address', fullName: 'Ada' })
        .success,
    ).toBe(false);
  });

  it('is amended only with a reason, and only in its name or address', () => {
    expect(updateUserSchema.safeParse({ fullName: 'Ada Obi' }).success).toBe(
      false,
    );
    expect(
      updateUserSchema.safeParse({ reason: 'Nothing to change' }).success,
    ).toBe(false);
    expect(
      updateUserSchema.parse({
        fullName: 'Ada Obi',
        isActive: false,
        reason: 'Name corrected',
      }),
    ).toEqual({ fullName: 'Ada Obi', reason: 'Name corrected' });
  });

  it('needs a reason for every change of status or reset', () => {
    expect(setUserStatusSchema.safeParse({ isActive: false }).success).toBe(
      false,
    );
    expect(
      setUserStatusSchema.safeParse({ isActive: false, reason: 'Left' })
        .success,
    ).toBe(true);
    expect(reasonSchema.safeParse({}).success).toBe(false);
    expect(reasonSchema.safeParse({ reason: ' ok ' }).success).toBe(false);
    expect(
      setSecondFactorEnforcementSchema.safeParse({ enforced: true }).success,
    ).toBe(false);
  });
});

describe('giving access', () => {
  it('names a role, a part of the Union, and a reason', () => {
    expect(
      assignRoleSchema.safeParse({
        roleCode: 'FIELD_ENUMERATOR',
        organisationId: ORGANISATION,
        reason: 'Posted to the branch',
      }).success,
    ).toBe(true);
    expect(
      assignRoleSchema.safeParse({
        roleCode: 'FIELD_ENUMERATOR',
        organisationId: 'the-branch',
        reason: 'Posted to the branch',
      }).success,
    ).toBe(false);
  });

  it('grants or revokes only a permission in the catalogue', () => {
    const scoped = (permission: string) =>
      scopedPermissionSchema.safeParse({
        permission,
        organisationId: ORGANISATION,
        reason: 'Authorised by the chairman',
      }).success;

    expect(scoped('vehicle.declare')).toBe(true);
    expect(scoped('member.read')).toBe(true);
    for (const invented of ['database.read', 'admin', '*', 'vehicle.*', '']) {
      expect(scoped(invented), invented).toBe(false);
    }
  });
});

describe('a composed role (Decision 9.5)', () => {
  const role = (permissions: string[]) =>
    createRoleSchema.safeParse({
      code: 'ZONE_CLERK',
      label: 'Zone clerk',
      permissions,
    }).success;

  it('holds permissions from the catalogue', () => {
    expect(role(['member.read', 'vehicle.read'])).toBe(true);
    expect(role([])).toBe(false);
    expect(role(['member.read', 'database.read'])).toBe(false);
  });

  it('can never hold a permission given only by express grant', () => {
    expect(role(['vehicle.read', 'vehicle.declare'])).toBe(false);
    expect(role(['payment.read', 'payment.manage_settlement'])).toBe(false);
    expect(
      updateRoleSchema.safeParse({
        label: 'Zone clerk',
        permissions: ['vehicle.declare'],
        reason: 'Trying to add it later',
      }).success,
    ).toBe(false);
  });

  it('keeps each permission once, and its code fixed', () => {
    const created = createRoleSchema.parse({
      code: 'ZONE_CLERK',
      label: 'Zone clerk',
      permissions: ['member.read', 'member.read'],
    });
    expect(created.permissions).toEqual(['member.read']);
    const updated = updateRoleSchema.parse({
      code: 'RENAMED',
      label: 'Zone clerk',
      permissions: ['member.read'],
      reason: 'Narrowed',
    });
    expect(updated).not.toHaveProperty('code');
    expect(
      createRoleSchema.safeParse({
        code: 'zone clerk',
        label: 'Zone clerk',
        permissions: ['member.read'],
      }).success,
    ).toBe(false);
  });
});

describe('signing in and passwords', () => {
  it('takes a second-factor code beside the password, when there is one', () => {
    const base = { email: 'ada@nurtw.test', password: 'whatever-it-is' };
    expect(loginSchema.parse(base)).toEqual(base);
    expect(loginSchema.parse({ ...base, code: ' 081804 ' }).code).toBe(
      '081804',
    );
    expect(
      loginSchema.safeParse({ ...base, code: 'ABCD-EFGH-IJKL-MNOP' }).success,
    ).toBe(true);
    expect(loginSchema.safeParse({ ...base, code: '123' }).success).toBe(false);
  });

  it('holds a new password to twelve characters, and the old to none', () => {
    const change = (currentPassword: string, newPassword: string) =>
      changePasswordSchema.safeParse({ currentPassword, newPassword }).success;

    // The current password predates any rule, so only its presence is asked.
    expect(change('old', 'a-much-longer-passphrase')).toBe(true);
    expect(change('old', 'short')).toBe(false);
    expect(change('', 'a-much-longer-passphrase')).toBe(false);
  });
});
