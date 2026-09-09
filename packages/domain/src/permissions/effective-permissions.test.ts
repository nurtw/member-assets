import { describe, expect, it } from 'vitest';

import {
  decidePermission,
  hasPermission,
  hasPermissionAnywhere,
  listEffectivePermissions,
  type PermissionAssignments,
} from './effective-permissions.js';
import { buildOrganisationPath } from './organisation-scope.js';

/**
 * ARCHITECTURE.md Decision 13.1 lists scope enforcement as requiring coverage
 * before the item introducing it is complete.
 *
 * Synthetic fixtures only (PRD §25.2).
 */

const COUNCIL = buildOrganisationPath(['council']);
const ZONE = buildOrganisationPath(['council', 'zone-a']);
const BRANCH = buildOrganisationPath(['council', 'zone-a', 'branch-1']);
const UNIT = buildOrganisationPath(['council', 'zone-a', 'branch-1', 'unit-x']);
const SIBLING_BRANCH = buildOrganisationPath(['council', 'zone-a', 'branch-2']);
const OTHER_ZONE = buildOrganisationPath(['council', 'zone-b']);

const empty: PermissionAssignments = {
  fromRoles: [],
  grants: [],
  revocations: [],
};

const at = (permission: string, scopePath: string) => ({
  permission,
  scopePath,
});

describe('decidePermission — scope containment', () => {
  it('allows a permission held at the subject’s own node', () => {
    const assignments = {
      ...empty,
      fromRoles: [at('vehicle.declare', BRANCH)],
    };

    expect(
      decidePermission(assignments, {
        permission: 'vehicle.declare',
        subjectPath: BRANCH,
      }),
    ).toEqual({ allowed: true, via: 'ROLE' });
  });

  it('allows downward — a branch scope covers a unit beneath it', () => {
    const assignments = {
      ...empty,
      fromRoles: [at('vehicle.declare', BRANCH)],
    };

    expect(
      hasPermission(assignments, {
        permission: 'vehicle.declare',
        subjectPath: UNIT,
      }),
    ).toBe(true);
  });

  it('refuses upward — a branch scope does not reach the zone above it', () => {
    const assignments = {
      ...empty,
      fromRoles: [at('vehicle.declare', BRANCH)],
    };

    expect(
      decidePermission(assignments, {
        permission: 'vehicle.declare',
        subjectPath: ZONE,
      }),
    ).toEqual({ allowed: false, reason: 'OUT_OF_SCOPE' });
  });

  it('refuses sideways — a branch scope does not reach a sibling branch', () => {
    // Without this the eleven roles collapse into one privilege level the moment
    // a second branch exists.
    const assignments = { ...empty, fromRoles: [at('member.approve', BRANCH)] };

    expect(
      hasPermission(assignments, {
        permission: 'member.approve',
        subjectPath: SIBLING_BRANCH,
      }),
    ).toBe(false);
  });

  it('does not leak to a sibling whose id shares a prefix', () => {
    // "/c/branch-1/" must not appear to contain "/c/branch-10/". The trailing
    // separator is what prevents it; a naive startsWith without it would widen
    // the scope silently.
    const branch1 = buildOrganisationPath(['c', 'branch-1']);
    const branch10 = buildOrganisationPath(['c', 'branch-10']);
    const assignments = { ...empty, fromRoles: [at('card.issue', branch1)] };

    expect(
      hasPermission(assignments, {
        permission: 'card.issue',
        subjectPath: branch10,
      }),
    ).toBe(false);
  });

  it('treats the root scope as Union-wide', () => {
    const assignments = { ...empty, fromRoles: [at('audit.export', '/')] };

    for (const path of [COUNCIL, ZONE, BRANCH, UNIT, OTHER_ZONE]) {
      expect(
        hasPermission(assignments, {
          permission: 'audit.export',
          subjectPath: path,
        }),
      ).toBe(true);
    }
  });

  it('reports NOT_HELD when the permission is absent entirely', () => {
    expect(
      decidePermission(empty, {
        permission: 'vehicle.declare',
        subjectPath: BRANCH,
      }),
    ).toEqual({ allowed: false, reason: 'NOT_HELD' });
  });
});

describe('decidePermission — the three layers', () => {
  it('allows via an individual grant when no role confers it', () => {
    // Decision 9.7 — vehicle.declare is in no bundle but super administrator, so
    // this layer is how an operator obtains it at all.
    const assignments = { ...empty, grants: [at('vehicle.declare', BRANCH)] };

    expect(
      decidePermission(assignments, {
        permission: 'vehicle.declare',
        subjectPath: BRANCH,
      }),
    ).toEqual({ allowed: true, via: 'GRANT' });
  });

  it('REVOCATION WINS over a role grant', () => {
    const assignments: PermissionAssignments = {
      fromRoles: [at('member.approve', COUNCIL)],
      grants: [],
      revocations: [at('member.approve', COUNCIL)],
    };

    expect(
      decidePermission(assignments, {
        permission: 'member.approve',
        subjectPath: BRANCH,
      }),
    ).toEqual({ allowed: false, reason: 'REVOKED' });
  });

  it('REVOCATION WINS over an individual grant', () => {
    const assignments: PermissionAssignments = {
      fromRoles: [],
      grants: [at('vehicle.declare', BRANCH)],
      revocations: [at('vehicle.declare', BRANCH)],
    };

    expect(
      hasPermission(assignments, {
        permission: 'vehicle.declare',
        subjectPath: BRANCH,
      }),
    ).toBe(false);
  });

  it('REVOCATION WINS regardless of the order entries appear in', () => {
    // Guards against an implementation that returns on the first match found
    // while iterating a merged list.
    const assignments: PermissionAssignments = {
      fromRoles: [at('card.issue', COUNCIL)],
      grants: [at('card.issue', COUNCIL)],
      revocations: [at('card.issue', COUNCIL)],
    };

    expect(
      hasPermission(assignments, {
        permission: 'card.issue',
        subjectPath: UNIT,
      }),
    ).toBe(false);
  });

  it('a revocation at a broad scope suppresses a grant at a narrow one beneath it', () => {
    const assignments: PermissionAssignments = {
      fromRoles: [],
      grants: [at('vehicle.declare', UNIT)],
      revocations: [at('vehicle.declare', COUNCIL)],
    };

    expect(
      hasPermission(assignments, {
        permission: 'vehicle.declare',
        subjectPath: UNIT,
      }),
    ).toBe(false);
  });

  it('a revocation at a narrow scope does not suppress a grant above it', () => {
    // Revoking within one unit must not disable the permission across the whole
    // council, or a targeted revocation becomes a blunt one.
    const assignments: PermissionAssignments = {
      fromRoles: [at('member.approve', COUNCIL)],
      grants: [],
      revocations: [at('member.approve', UNIT)],
    };

    expect(
      hasPermission(assignments, {
        permission: 'member.approve',
        subjectPath: SIBLING_BRANCH,
      }),
    ).toBe(true);
    expect(
      hasPermission(assignments, {
        permission: 'member.approve',
        subjectPath: UNIT,
      }),
    ).toBe(false);
  });

  it('a revocation of one permission does not affect another', () => {
    const assignments: PermissionAssignments = {
      fromRoles: [at('card.issue', COUNCIL), at('sticker.issue', COUNCIL)],
      grants: [],
      revocations: [at('card.issue', COUNCIL)],
    };

    expect(
      hasPermission(assignments, {
        permission: 'sticker.issue',
        subjectPath: BRANCH,
      }),
    ).toBe(true);
  });

  it('unions scopes across multiple roles', () => {
    const assignments = {
      ...empty,
      fromRoles: [
        at('member.approve', BRANCH),
        at('member.approve', OTHER_ZONE),
      ],
    };

    expect(
      hasPermission(assignments, {
        permission: 'member.approve',
        subjectPath: OTHER_ZONE,
      }),
    ).toBe(true);
    expect(
      hasPermission(assignments, {
        permission: 'member.approve',
        subjectPath: UNIT,
      }),
    ).toBe(true);
  });
});

describe('listEffectivePermissions', () => {
  it('supports answering "who may declare a vehicle, and where"', () => {
    // Decision 9.7.1 — the interface must answer this directly rather than by
    // reasoning across bundles and grants by hand.
    const assignments: PermissionAssignments = {
      fromRoles: [at('card.issue', BRANCH)],
      grants: [at('vehicle.declare', UNIT)],
      revocations: [],
    };

    expect(listEffectivePermissions(assignments)).toEqual([
      { permission: 'card.issue', scopePath: BRANCH },
      { permission: 'vehicle.declare', scopePath: UNIT },
    ]);
  });

  it('omits revoked permissions', () => {
    const assignments: PermissionAssignments = {
      fromRoles: [at('card.issue', BRANCH), at('sticker.issue', BRANCH)],
      grants: [],
      revocations: [at('card.issue', COUNCIL)],
    };

    expect(listEffectivePermissions(assignments)).toEqual([
      { permission: 'sticker.issue', scopePath: BRANCH },
    ]);
  });

  it('returns nothing for a user with no assignments', () => {
    expect(listEffectivePermissions(empty)).toEqual([]);
  });
});

describe('hasPermissionAnywhere', () => {
  it('is true for a permission held at any scope', () => {
    // A branch administrator holds their permissions without holding them
    // Union-wide. Asking about the root would deny them everything.
    const assignments = { ...empty, fromRoles: [at('card.issue', BRANCH)] };

    expect(hasPermissionAnywhere(assignments, 'card.issue')).toBe(true);
  });

  it('is false for a permission not held at all', () => {
    expect(hasPermissionAnywhere(empty, 'card.issue')).toBe(false);
  });

  it('respects revocation', () => {
    const assignments: PermissionAssignments = {
      fromRoles: [at('card.issue', BRANCH)],
      grants: [],
      revocations: [at('card.issue', COUNCIL)],
    };

    expect(hasPermissionAnywhere(assignments, 'card.issue')).toBe(false);
  });

  it('remains true when revoked in one scope but held in another', () => {
    const assignments: PermissionAssignments = {
      fromRoles: [at('card.issue', BRANCH), at('card.issue', OTHER_ZONE)],
      grants: [],
      revocations: [at('card.issue', BRANCH)],
    };

    expect(hasPermissionAnywhere(assignments, 'card.issue')).toBe(true);
  });
});
