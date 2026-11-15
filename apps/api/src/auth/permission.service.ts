import { Injectable } from '@nestjs/common';
import {
  decidePermission,
  hasPermissionAnywhere,
  listEffectivePermissions,
  type PermissionAssignments,
  type PermissionDecision,
  type ScopedPermission,
} from '@nurtw/domain';

import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Loads a user's assignments and defers every decision to `@nurtw/domain`.
 *
 * This class deliberately contains no authorisation logic of its own. The rules
 * — revocation wins, scope containment, the three layers — live in
 * `packages/domain` where they are exhaustively tested without a database
 * (ARCHITECTURE.md Decision 3.2). Duplicating any of that reasoning here would
 * create a second place for it to drift.
 *
 * Assignments are read fresh on each check. A revoked permission therefore
 * applies immediately, which is the same property that made opaque sessions the
 * right choice over JWTs (Decision 9.1).
 */
@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One round trip, not eleven. Prisma loads each nested relation with a query
   * of its own, so reading a user's roles, their permissions, their grants,
   * their revocations, and the organisations those sit at took about eleven
   * queries, on every request that asked who may do what. The three sources
   * are joined here in one statement; the decision itself is still made by
   * `@nurtw/domain`.
   *
   * Nothing is remembered between calls, and nothing within a request: a
   * revoked permission, a moved organisation, or an edited role applies to
   * the very next check.
   */
  async loadAssignments(userId: string): Promise<PermissionAssignments> {
    const rows = await this.prisma.$queryRaw<
      { kind: 'ROLE' | 'GRANT' | 'REVOCATION'; permission: string; scopePath: string }[]
    >`
      SELECT 'ROLE' AS kind, p.code AS permission, o.path AS "scopePath"
      FROM user_role_assignment a
      JOIN organisation o ON o.id = a.organisation_id
      JOIN role_permission rp ON rp.role_id = a.role_id
      JOIN permission p ON p.id = rp.permission_id
      WHERE a.user_id = ${userId}::uuid
      UNION ALL
      SELECT 'GRANT' AS kind, p.code AS permission, o.path AS "scopePath"
      FROM user_permission_grant g
      JOIN organisation o ON o.id = g.organisation_id
      JOIN permission p ON p.id = g.permission_id
      WHERE g.user_id = ${userId}::uuid
      UNION ALL
      SELECT 'REVOCATION' AS kind, p.code AS permission, o.path AS "scopePath"
      FROM user_permission_revocation r
      JOIN organisation o ON o.id = r.organisation_id
      JOIN permission p ON p.id = r.permission_id
      WHERE r.user_id = ${userId}::uuid`;

    const pick = (kind: 'ROLE' | 'GRANT' | 'REVOCATION'): ScopedPermission[] =>
      rows
        .filter((row) => row.kind === kind)
        .map((row) => ({
          permission: row.permission,
          scopePath: row.scopePath,
        }));

    // A role confers each of its permissions at the scope the role was
    // assigned in, which is what the join above yields row by row.
    return {
      fromRoles: pick('ROLE'),
      grants: pick('GRANT'),
      revocations: pick('REVOCATION'),
    };
  }

  async decide(
    userId: string,
    permission: string,
    subjectPath: string,
  ): Promise<PermissionDecision> {
    const assignments = await this.loadAssignments(userId);
    return decidePermission(assignments, { permission, subjectPath });
  }

  async can(
    userId: string,
    permission: string,
    subjectPath: string,
  ): Promise<boolean> {
    return (await this.decide(userId, permission, subjectPath)).allowed;
  }

  /**
   * True when the user holds the permission in at least one scope.
   *
   * For routes acting on no particular record only. A route touching a specific
   * member, vehicle, card, or sticker must use {@link can} with that record's
   * organisation path, or a branch administrator would be able to act on another
   * branch's records.
   */
  async canAnywhere(userId: string, permission: string): Promise<boolean> {
    return hasPermissionAnywhere(
      await this.loadAssignments(userId),
      permission,
    );
  }

  /**
   * Of `candidates`, the permissions the user holds over `subjectPath`, with
   * revocations applied. For the no-escalation rule of item 28: nobody gives
   * what they do not hold there.
   */
  async heldAt(
    userId: string,
    candidates: readonly string[],
    subjectPath: string,
  ): Promise<string[]> {
    const assignments = await this.loadAssignments(userId);
    return candidates.filter(
      (permission) =>
        decidePermission(assignments, { permission, subjectPath }).allowed,
    );
  }

  /** Of `candidates`, the permissions the user holds in at least one scope. */
  async heldAnywhere(
    userId: string,
    candidates: readonly string[],
  ): Promise<string[]> {
    const assignments = await this.loadAssignments(userId);
    return candidates.filter((permission) =>
      hasPermissionAnywhere(assignments, permission),
    );
  }

  /** Decision 9.7.1 — "what may this user do, and where", answered directly. */
  async listFor(userId: string): Promise<ScopedPermission[]> {
    return listEffectivePermissions(await this.loadAssignments(userId));
  }

  /**
   * Decision 9.7.1 — "who may currently exercise this permission, and in what
   * scope". `vehicle.declare` is held so narrowly that it is worthless as a
   * control if establishing who holds it requires reasoning across bundles,
   * grants, and revocations by hand.
   */
  async listHolders(
    permission: string,
  ): Promise<
    {
      userId: string;
      email: string;
      scopePath: string;
      via: 'ROLE' | 'GRANT';
    }[]
  > {
    const [viaRoles, viaGrants] = await Promise.all([
      this.prisma.userRoleAssignment.findMany({
        where: {
          role: { permissions: { some: { permission: { code: permission } } } },
        },
        select: {
          userId: true,
          user: { select: { email: true } },
          organisation: { select: { path: true } },
        },
      }),
      this.prisma.userPermissionGrant.findMany({
        where: { permission: { code: permission } },
        select: {
          userId: true,
          user: { select: { email: true } },
          organisation: { select: { path: true } },
        },
      }),
    ]);

    const candidates = [
      ...viaRoles.map((row) => ({
        userId: row.userId,
        email: row.user.email,
        scopePath: row.organisation.path,
        via: 'ROLE' as const,
      })),
      ...viaGrants.map((row) => ({
        userId: row.userId,
        email: row.user.email,
        scopePath: row.organisation.path,
        via: 'GRANT' as const,
      })),
    ];

    // Subtract revocations by re-deciding each candidate through the domain
    // logic, so this listing can never disagree with what the guard enforces.
    // A user's assignments are loaded once, however many rows name them.
    const assignmentsByUser = new Map<string, PermissionAssignments>();
    for (const userId of new Set(candidates.map((c) => c.userId))) {
      assignmentsByUser.set(userId, await this.loadAssignments(userId));
    }
    const results: typeof candidates = [];
    for (const candidate of candidates) {
      const assignments = assignmentsByUser.get(candidate.userId)!;
      if (
        decidePermission(assignments, {
          permission,
          subjectPath: candidate.scopePath,
        }).allowed
      ) {
        results.push(candidate);
      }
    }
    return results;
  }
}
