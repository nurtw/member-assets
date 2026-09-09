import {
  anyScopeContains,
  type OrganisationPath,
} from './organisation-scope.js';

/**
 * Effective-permission resolution.
 *
 * ARCHITECTURE.md Decision 9.3 — the model has three layers, evaluated in order:
 *
 *   1. Role grants     — the seeded bundles of PRD §16; a user may hold several
 *   2. Per-user grants — an individual permission switched on for one user
 *   3. Per-user revocations — an individual permission switched off for one user
 *
 *   effective = (union of role permissions) + grants − revocations
 *
 * **Revocation always wins.** Where a permission is both granted and revoked for
 * the same user and overlapping scope, it is withheld. Ambiguity in an
 * access-control system must resolve towards denial; the alternative is a
 * revocation that silently does nothing, which is the worst possible outcome for
 * a control whose entire purpose is to take access away.
 *
 * Decision 9.2 — code asks whether the actor holds `vehicle.declare`. It never
 * asks whether the actor is a Vehicle-Record Officer. Roles exist to make
 * permissions administrable, not to make authorisation decisions.
 *
 * This module deliberately depends on nothing but its sibling scope helper
 * (Decision 3.2): no Nest, no Prisma, no database. It is the highest
 * correctness-risk logic in the system and must remain exhaustively testable in
 * isolation.
 */

/** A permission code, `resource.action` — e.g. `vehicle.declare`. */
export type PermissionCode = string;

/** A permission held at a scope. */
export interface ScopedPermission {
  readonly permission: PermissionCode;
  readonly scopePath: OrganisationPath;
}

/** Everything needed to decide what one user may do. */
export interface PermissionAssignments {
  /** Permissions arriving via role membership, already flattened with their scopes. */
  readonly fromRoles: readonly ScopedPermission[];
  /** Individually granted permissions (Decision 9.3, layer 2). */
  readonly grants: readonly ScopedPermission[];
  /** Individually revoked permissions (Decision 9.3, layer 3). */
  readonly revocations: readonly ScopedPermission[];
}

export interface PermissionQuery {
  readonly permission: PermissionCode;
  /** Path of the organisation the subject record belongs to. */
  readonly subjectPath: OrganisationPath;
}

export type PermissionDecision =
  | { readonly allowed: true; readonly via: 'ROLE' | 'GRANT' }
  | {
      readonly allowed: false;
      readonly reason: 'NOT_HELD' | 'OUT_OF_SCOPE' | 'REVOKED';
    };

function scopesFor(
  entries: readonly ScopedPermission[],
  permission: PermissionCode,
): OrganisationPath[] {
  return entries
    .filter((entry) => entry.permission === permission)
    .map((entry) => entry.scopePath);
}

/**
 * Decides a single permission question, and reports why.
 *
 * The reason is for the audit trail and for operator diagnostics. It is never
 * returned to an external caller: PRD Requirement 14.3 requires a generic
 * response, because "revoked" and "out of scope" and "no such record" are
 * themselves facts about the record set.
 */
export function decidePermission(
  assignments: PermissionAssignments,
  query: PermissionQuery,
): PermissionDecision {
  const { permission, subjectPath } = query;

  // Revocation is checked FIRST and short-circuits. Ordering is not an
  // optimisation here — it is the rule. A revocation that could be overridden by
  // a role or a grant would be no revocation at all.
  const revokedScopes = scopesFor(assignments.revocations, permission);
  if (anyScopeContains(revokedScopes, subjectPath)) {
    return { allowed: false, reason: 'REVOKED' };
  }

  const grantScopes = scopesFor(assignments.grants, permission);
  if (anyScopeContains(grantScopes, subjectPath)) {
    return { allowed: true, via: 'GRANT' };
  }

  const roleScopes = scopesFor(assignments.fromRoles, permission);
  if (anyScopeContains(roleScopes, subjectPath)) {
    return { allowed: true, via: 'ROLE' };
  }

  // Distinguish "you have this permission, but not here" from "you do not have
  // this permission" — useful in an audit trail when reviewing why an officer
  // was refused.
  const heldAnywhere = roleScopes.length > 0 || grantScopes.length > 0;
  return {
    allowed: false,
    reason: heldAnywhere ? 'OUT_OF_SCOPE' : 'NOT_HELD',
  };
}

/** Convenience predicate over {@link decidePermission}. */
export function hasPermission(
  assignments: PermissionAssignments,
  query: PermissionQuery,
): boolean {
  return decidePermission(assignments, query).allowed;
}

/**
 * True when the user can exercise the permission in *at least one* scope.
 *
 * For routes that act on no particular record — "list my own permissions", "open
 * the dashboard" — there is no subject whose scope could be tested, and asking
 * about the root would be wrong in both directions. It is too strict, because a
 * branch administrator legitimately holds their permissions without holding them
 * Union-wide; and it is meaningless, because no record lives at the root.
 *
 * Record-scoped routes must NOT use this. They resolve the subject's
 * organisation path and call {@link decidePermission}, so that holding a
 * permission in one branch never authorises acting on another.
 */
export function hasPermissionAnywhere(
  assignments: PermissionAssignments,
  permission: PermissionCode,
): boolean {
  return listEffectivePermissions(assignments).some(
    (entry) => entry.permission === permission,
  );
}

/**
 * Every permission the user can exercise somewhere, with the scopes it applies
 * in, after revocations are subtracted.
 *
 * Supports Decision 9.7.1 — the administration interface must be able to answer
 * "who may currently declare a vehicle, and within what scope" directly. A
 * permission held this narrowly is worthless as a control if establishing who
 * holds it requires reasoning across bundles, grants, and revocations by hand.
 */
export function listEffectivePermissions(
  assignments: PermissionAssignments,
): ScopedPermission[] {
  const held = [...assignments.fromRoles, ...assignments.grants];

  return held.filter((entry) => {
    const revokedScopes = scopesFor(assignments.revocations, entry.permission);
    return !anyScopeContains(revokedScopes, entry.scopePath);
  });
}
