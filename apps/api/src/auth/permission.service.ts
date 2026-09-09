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

  async loadAssignments(userId: string): Promise<PermissionAssignments> {
    const [roleAssignments, grants, revocations] = await Promise.all([
      this.prisma.userRoleAssignment.findMany({
        where: { userId },
        select: {
          organisation: { select: { path: true } },
          role: {
            select: {
              permissions: {
                select: { permission: { select: { code: true } } },
              },
            },
          },
        },
      }),
      this.prisma.userPermissionGrant.findMany({
        where: { userId },
        select: {
          permission: { select: { code: true } },
          organisation: { select: { path: true } },
        },
      }),
      this.prisma.userPermissionRevocation.findMany({
        where: { userId },
        select: {
          permission: { select: { code: true } },
          organisationId: true,
        },
      }),
    ]);

    // A role confers each of its permissions at the scope the role was assigned
    // in — the cross product, flattened.
    const fromRoles: ScopedPermission[] = roleAssignments.flatMap(
      (assignment) =>
        assignment.role.permissions.map((rolePermission) => ({
          permission: rolePermission.permission.code,
          scopePath: assignment.organisation.path,
        })),
    );

    // Revocations store an organisation id; resolve to paths in one query rather
    // than joining per row.
    const revocationPaths = await this.resolvePaths(
      revocations.map((revocation) => revocation.organisationId),
    );

    return {
      fromRoles,
      grants: grants.map((grant) => ({
        permission: grant.permission.code,
        scopePath: grant.organisation.path,
      })),
      revocations: revocations.map((revocation) => ({
        permission: revocation.permission.code,
        scopePath: revocationPaths.get(revocation.organisationId) ?? '/',
      })),
    };
  }

  private async resolvePaths(
    ids: readonly string[],
  ): Promise<Map<string, string>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.organisation.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, path: true },
    });
    return new Map(rows.map((row) => [row.id, row.path]));
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
    const results: typeof candidates = [];
    for (const candidate of candidates) {
      if (await this.can(candidate.userId, permission, candidate.scopePath)) {
        results.push(candidate);
      }
    }
    return results;
  }
}
