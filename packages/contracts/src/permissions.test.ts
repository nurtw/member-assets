import { describe, expect, it } from 'vitest';

import {
  DECLARE_PERMISSION,
  PERMISSIONS,
  PERMISSION_CODES,
  SYSTEM_ROLES,
} from './permissions.js';

describe('permission catalogue', () => {
  it('has no duplicate codes', () => {
    expect(new Set(PERMISSION_CODES).size).toBe(PERMISSION_CODES.length);
  });

  it('names every permission resource.action', () => {
    // Matches the audit trail's action convention, so a permission and the event
    // it produces read the same in both places.
    for (const code of PERMISSION_CODES) {
      expect(code).toMatch(/^[a-z][a-z_]*\.[a-z][a-z_]*$/);
    }
  });

  it('defines no broad scope-like permission', () => {
    // PRD Requirement 12.4 — a permission that does not exist cannot be granted
    // by mistake. These are the shapes the proposal names explicitly.
    for (const code of PERMISSION_CODES) {
      expect(code).not.toMatch(/^database\.|\.all$|^.*\.read_all$/);
    }
  });

  it('gives every permission a description', () => {
    for (const permission of PERMISSIONS) {
      expect(permission.description.length).toBeGreaterThan(10);
    }
  });

  it('enables step-up on nothing yet', () => {
    // Decision 9.7.3 — the capability is built but not enabled, and
    // vehicle.declare was expressly determined not to require it.
    for (const permission of PERMISSIONS) {
      expect(permission).not.toHaveProperty('requiresStepUp', true);
    }
  });
});

describe('system roles', () => {
  it('defines the eleven roles of PRD §16', () => {
    expect(SYSTEM_ROLES).toHaveLength(11);
  });

  it('has no duplicate role codes', () => {
    const codes = SYSTEM_ROLES.map((role) => role.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('references only permissions that exist in the catalogue', () => {
    // A bundle naming a permission that was renamed or removed would silently
    // grant nothing, and the role would look correct while conferring less than
    // intended.
    const known = new Set(PERMISSION_CODES);
    for (const role of SYSTEM_ROLES) {
      for (const permission of role.permissions) {
        expect(
          known,
          `${role.code} references unknown ${permission}`,
        ).toContain(permission);
      }
    }
  });

  it('gives the super administrator the whole catalogue', () => {
    const superAdmin = SYSTEM_ROLES.find(
      (r) => r.code === 'SUPER_ADMINISTRATOR',
    );
    expect([...(superAdmin?.permissions ?? [])].sort()).toEqual(
      [...PERMISSION_CODES].sort(),
    );
  });
});

describe('vehicle.declare containment', () => {
  /**
   * ARCHITECTURE.md Decision 9.7 — `vehicle.declare` belongs to the super
   * administrator alone, and reaches anyone else only by express per-user grant.
   *
   * This is the single most load-bearing assertion in this file. The permission
   * is the only route by which a declaration can come into existence (PRD §9.5),
   * so adding it to a convenient-looking bundle would quietly undo the control.
   */
  it('appears in the super administrator bundle and no other', () => {
    const holders = SYSTEM_ROLES.filter((role) =>
      (role.permissions as readonly string[]).includes(DECLARE_PERMISSION),
    ).map((role) => role.code);

    expect(holders).toEqual(['SUPER_ADMINISTRATOR']);
  });

  it('is absent from the vehicle-record officer bundle', () => {
    // The role whose name most invites the mistake.
    const officer = SYSTEM_ROLES.find(
      (r) => r.code === 'VEHICLE_RECORD_OFFICER',
    );
    expect(officer?.permissions as readonly string[]).not.toContain(
      DECLARE_PERMISSION,
    );
    // It can still read and amend declarations — only creation is withheld.
    expect(officer?.permissions as readonly string[]).toContain(
      'vehicle.update',
    );
  });

  it('is absent from the branch and unit administrator bundle', () => {
    const admin = SYSTEM_ROLES.find(
      (r) => r.code === 'BRANCH_UNIT_ADMINISTRATOR',
    );
    expect(admin?.permissions as readonly string[]).not.toContain(
      DECLARE_PERMISSION,
    );
  });
});

describe('verification officer holds no write permission', () => {
  it('carries only read and verify permissions', () => {
    // PRD §9.5–9.6 — verification is read-only without exception. Expressed here
    // as data so the role cannot drift into holding a write permission.
    const officer = SYSTEM_ROLES.find((r) => r.code === 'VERIFICATION_OFFICER');
    const writeVerbs =
      /\.(declare|create|update|issue|approve|replace|suspend|revoke|manage|decide|grant|export)$/;

    for (const permission of officer?.permissions ?? []) {
      expect(permission, `${permission} is a write permission`).not.toMatch(
        writeVerbs,
      );
    }
  });
});

describe('external organisations receive no internal permission', () => {
  it('defines no permission granting unrestricted record access', () => {
    // PRD Requirement 16.1 — no external organisation may receive administrator,
    // record-editing, issuance, or unrestricted database privileges. Internal
    // permissions and external scopes share no storage (Decision 9.8); this test
    // guards the catalogue against a permission that would blur the two.
    for (const code of PERMISSION_CODES) {
      expect(code).not.toMatch(/^client\.|^external\./);
    }
  });
});
