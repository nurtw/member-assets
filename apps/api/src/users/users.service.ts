import { randomInt } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AssignRoleInput,
  CreateUserInput,
  IssuedTemporaryPassword,
  ScopedPermissionInput,
  SetUserStatusInput,
  UpdateUserInput,
  UserDetail,
  UserSummary,
} from '@nurtw/contracts';
import { escalations } from '@nurtw/domain';
import type { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service.js';
import { PasswordService } from '../auth/password.service.js';
import { PermissionService } from '../auth/permission.service.js';
import { SessionService } from '../auth/session.service.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const ORGANISATION_REF = { id: true, name: true, level: true } as const;

/**
 * An account, as selected for a response. `passwordHash`, `mfaSecret`, and
 * `mfaPendingSecret` are not here and must never be: an explicit select keeps
 * them out of every response this module builds.
 */
const SUMMARY_SELECT = {
  id: true,
  email: true,
  fullName: true,
  isActive: true,
  mustChangePassword: true,
  mfaEnabledAt: true,
  createdAt: true,
  roleAssignments: {
    select: {
      id: true,
      createdAt: true,
      role: { select: { code: true, label: true } },
      organisation: { select: ORGANISATION_REF },
    },
    orderBy: { createdAt: 'asc' },
  },
} as const;

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  permissionGrants: {
    select: {
      id: true,
      reason: true,
      createdAt: true,
      permission: { select: { code: true } },
      organisation: { select: ORGANISATION_REF },
      grantedBy: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
  permissionRevocations: {
    select: {
      id: true,
      reason: true,
      createdAt: true,
      organisationId: true,
      permission: { select: { code: true } },
      revokedBy: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
} as const;

type SummaryRow = Prisma.UserGetPayload<{ select: typeof SUMMARY_SELECT }>;
type DetailRow = Prisma.UserGetPayload<{ select: typeof DETAIL_SELECT }>;

/** No `0`/`O`, `1`/`l`/`I`: a temporary password is read out and typed in. */
const TEMPORARY_ALPHABET =
  'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Sixteen characters in four groups: about 92 bits. */
export function generateTemporaryPassword(): string {
  const characters = Array.from(
    { length: 16 },
    () => TEMPORARY_ALPHABET[randomInt(TEMPORARY_ALPHABET.length)],
  ).join('');
  return characters.match(/.{4}/g)!.join('-');
}

/**
 * Officer accounts and the access given to them (PRD §16 — item 28).
 *
 * - **A temporary password** is generated here, returned once, and must be
 *   changed at first sign-in. No administrator chooses or learns a lasting
 *   password.
 * - **Nobody gives what they do not hold.** A role is assigned, and a
 *   permission granted, only within a scope where the actor holds all of it.
 *   Otherwise `user.manage` in one branch would be a way to manufacture any
 *   access in that branch.
 * - **Nobody changes their own access or status.** A second administrator
 *   does it, so that one compromised session cannot widen itself.
 * - **An organisation outside the actor's scope answers 404**, like one that
 *   does not exist (item 04).
 * - **Every change is audited** with a reason. No audit event holds a
 *   password or a secret.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
    private readonly permissions: PermissionService,
    private readonly sessions: SessionService,
  ) {}

  // --- Reads -------------------------------------------------------------------

  async list(): Promise<UserSummary[]> {
    const rows = await this.prisma.user.findMany({
      select: SUMMARY_SELECT,
      orderBy: { fullName: 'asc' },
    });
    return rows.map((row) => this.toSummary(row));
  }

  async get(id: string): Promise<UserDetail> {
    const row = await this.prisma.user.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });
    if (!row) {
      throw new NotFoundException();
    }
    return this.toDetail(row);
  }

  // --- The account --------------------------------------------------------------

  async create(
    actor: ActorContext,
    input: CreateUserInput,
  ): Promise<IssuedTemporaryPassword> {
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await this.passwords.hash(temporaryPassword);
    const id = await this.prisma.$transaction(async (tx) => {
      const taken = await tx.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      });
      if (taken) {
        throw new ConflictException('An account with that email exists.');
      }
      const row = await tx.user.create({
        data: {
          email: input.email,
          fullName: input.fullName,
          passwordHash,
          mustChangePassword: true,
        },
        select: { id: true },
      });
      await this.audit.record(
        {
          action: 'user.create',
          subjectType: 'user',
          subjectId: row.id,
          actorUserId: actor.userId,
          after: { email: input.email, fullName: input.fullName },
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );
      return row.id;
    });
    return { user: await this.get(id), temporaryPassword };
  }

  async update(
    actor: ActorContext,
    id: string,
    input: UpdateUserInput,
  ): Promise<UserDetail> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({
        where: { id },
        select: { email: true, fullName: true },
      });
      if (!before) {
        throw new NotFoundException();
      }
      if (input.email !== undefined && input.email !== before.email) {
        const taken = await tx.user.findUnique({
          where: { email: input.email },
          select: { id: true },
        });
        if (taken) {
          throw new ConflictException('An account with that email exists.');
        }
      }
      const after = await tx.user.update({
        where: { id },
        data: {
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        },
        select: { email: true, fullName: true },
      });
      await this.audit.record(
        {
          action: 'user.update',
          subjectType: 'user',
          subjectId: id,
          actorUserId: actor.userId,
          before,
          after,
          reason: input.reason,
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );
    });
    return this.get(id);
  }

  /**
   * Deactivates or reactivates. Deactivation ends every session at once: the
   * session check refuses an inactive account, and the rows are revoked too.
   */
  async setStatus(
    actor: ActorContext,
    id: string,
    input: SetUserStatusInput,
  ): Promise<UserDetail> {
    this.notSelf(actor, id);
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({
        where: { id },
        select: { isActive: true },
      });
      if (!before) {
        throw new NotFoundException();
      }
      if (before.isActive === input.isActive) {
        throw new ConflictException('The account is already in that state.');
      }
      await tx.user.update({
        where: { id },
        data: {
          isActive: input.isActive,
          // Reactivating also clears a lock left from before.
          ...(input.isActive
            ? { failedSignInCount: 0, signInLockedUntil: null }
            : {}),
        },
      });
      if (!input.isActive) {
        await tx.userSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await this.audit.record(
        {
          action: input.isActive ? 'user.reactivate' : 'user.deactivate',
          subjectType: 'user',
          subjectId: id,
          actorUserId: actor.userId,
          before: { isActive: before.isActive },
          after: { isActive: input.isActive },
          reason: input.reason,
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );
    });
    return this.get(id);
  }

  /**
   * Issues a new temporary password, ends the officer's sessions, and clears
   * any lock. Not for one's own account: that is `POST /auth/password`.
   */
  async resetPassword(
    actor: ActorContext,
    id: string,
    reason: string,
  ): Promise<IssuedTemporaryPassword> {
    this.notSelf(actor, id);
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await this.passwords.hash(temporaryPassword);
    await this.prisma.$transaction(async (tx) => {
      const exists = await tx.user.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!exists) {
        throw new NotFoundException();
      }
      await tx.user.update({
        where: { id },
        data: {
          passwordHash,
          mustChangePassword: true,
          failedSignInCount: 0,
          signInLockedUntil: null,
        },
      });
      await tx.userSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(
        {
          action: 'user.password_reset',
          subjectType: 'user',
          subjectId: id,
          actorUserId: actor.userId,
          reason,
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );
    });
    return { user: await this.get(id), temporaryPassword };
  }

  /**
   * Removes an officer's second factor, for a lost phone with no recovery
   * code left. They enrol again at next sign-in. Their sessions are ended.
   */
  async resetSecondFactor(
    actor: ActorContext,
    id: string,
    reason: string,
  ): Promise<UserDetail> {
    this.notSelf(actor, id);
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({
        where: { id },
        select: { mfaEnabledAt: true },
      });
      if (!before) {
        throw new NotFoundException();
      }
      if (before.mfaEnabledAt === null) {
        throw new ConflictException('The account has no second factor.');
      }
      await tx.user.update({
        where: { id },
        data: {
          mfaSecret: null,
          mfaPendingSecret: null,
          mfaEnabledAt: null,
          mfaLastStep: null,
        },
      });
      await tx.userRecoveryCode.deleteMany({ where: { userId: id } });
      await tx.userSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(
        {
          action: 'user.second_factor_reset',
          subjectType: 'user',
          subjectId: id,
          actorUserId: actor.userId,
          reason,
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );
    });
    return this.get(id);
  }

  // --- Roles ----------------------------------------------------------------------

  async assignRole(
    actor: ActorContext,
    id: string,
    input: AssignRoleInput,
  ): Promise<UserDetail> {
    this.notSelf(actor, id);
    const organisation = await this.scopeFor(
      actor,
      'user.manage',
      input.organisationId,
    );
    const role = await this.prisma.role.findUnique({
      where: { code: input.roleCode },
      select: {
        id: true,
        code: true,
        permissions: { select: { permission: { select: { code: true } } } },
      },
    });
    if (!role) {
      throw new NotFoundException();
    }
    await this.assertNoEscalation(
      actor,
      role.permissions.map((entry) => entry.permission.code),
      organisation.path,
    );

    await this.prisma.$transaction(async (tx) => {
      await this.requireUser(tx, id);
      const held = await tx.userRoleAssignment.findUnique({
        where: {
          userId_roleId_organisationId: {
            userId: id,
            roleId: role.id,
            organisationId: organisation.id,
          },
        },
        select: { id: true },
      });
      if (held) {
        throw new ConflictException(
          'The officer already holds that role there.',
        );
      }
      await tx.userRoleAssignment.create({
        data: {
          userId: id,
          roleId: role.id,
          organisationId: organisation.id,
          assignedByUserId: actor.userId,
          reason: input.reason,
        },
      });
      await this.audit.record(
        {
          action: 'user.role_assign',
          subjectType: 'user',
          subjectId: id,
          organisationId: organisation.id,
          actorUserId: actor.userId,
          after: { role: role.code, organisationId: organisation.id },
          reason: input.reason,
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );
    });
    return this.get(id);
  }

  async removeRole(
    actor: ActorContext,
    id: string,
    assignmentId: string,
    reason: string,
  ): Promise<UserDetail> {
    this.notSelf(actor, id);
    const assignment = await this.prisma.userRoleAssignment.findFirst({
      where: { id: assignmentId, userId: id },
      select: {
        id: true,
        role: { select: { code: true } },
        organisation: { select: { id: true, path: true } },
      },
    });
    if (
      !assignment ||
      !(await this.permissions.can(
        actor.userId,
        'user.manage',
        assignment.organisation.path,
      ))
    ) {
      throw new NotFoundException();
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.userRoleAssignment.delete({ where: { id: assignment.id } });
      await this.audit.record(
        {
          action: 'user.role_remove',
          subjectType: 'user',
          subjectId: id,
          organisationId: assignment.organisation.id,
          actorUserId: actor.userId,
          before: {
            role: assignment.role.code,
            organisationId: assignment.organisation.id,
          },
          reason,
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );
    });
    return this.get(id);
  }

  // --- Single permissions ---------------------------------------------------------

  /** Decision 9.3, layer 2 — one permission switched on for one officer. */
  async grant(
    actor: ActorContext,
    id: string,
    input: ScopedPermissionInput,
  ): Promise<UserDetail> {
    this.notSelf(actor, id);
    const organisation = await this.scopeFor(
      actor,
      'permission.grant',
      input.organisationId,
    );
    await this.assertNoEscalation(actor, [input.permission], organisation.path);
    const permission = await this.requirePermission(input.permission);

    await this.prisma.$transaction(async (tx) => {
      await this.requireUser(tx, id);
      const held = await tx.userPermissionGrant.findUnique({
        where: {
          userId_permissionId_organisationId: {
            userId: id,
            permissionId: permission.id,
            organisationId: organisation.id,
          },
        },
        select: { id: true },
      });
      if (held) {
        throw new ConflictException(
          'That permission is already granted there.',
        );
      }
      await tx.userPermissionGrant.create({
        data: {
          userId: id,
          permissionId: permission.id,
          organisationId: organisation.id,
          grantedByUserId: actor.userId,
          reason: input.reason,
        },
      });
      await this.audit.record(
        {
          action: 'user.permission_grant',
          subjectType: 'user',
          subjectId: id,
          organisationId: organisation.id,
          actorUserId: actor.userId,
          after: {
            permission: input.permission,
            organisationId: organisation.id,
          },
          reason: input.reason,
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );
    });
    return this.get(id);
  }

  async withdrawGrant(
    actor: ActorContext,
    id: string,
    grantId: string,
    reason: string,
  ): Promise<UserDetail> {
    this.notSelf(actor, id);
    const grant = await this.prisma.userPermissionGrant.findFirst({
      where: { id: grantId, userId: id },
      select: {
        id: true,
        permission: { select: { code: true } },
        organisation: { select: { id: true, path: true } },
      },
    });
    if (
      !grant ||
      !(await this.permissions.can(
        actor.userId,
        'permission.grant',
        grant.organisation.path,
      ))
    ) {
      throw new NotFoundException();
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.userPermissionGrant.delete({ where: { id: grant.id } });
      await this.audit.record(
        {
          action: 'user.permission_grant_withdraw',
          subjectType: 'user',
          subjectId: id,
          organisationId: grant.organisation.id,
          actorUserId: actor.userId,
          before: {
            permission: grant.permission.code,
            organisationId: grant.organisation.id,
          },
          reason,
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );
    });
    return this.get(id);
  }

  /**
   * Decision 9.3, layer 3 — one permission switched off for one officer,
   * whatever their roles give. Taking access away needs no holding of it.
   */
  async revoke(
    actor: ActorContext,
    id: string,
    input: ScopedPermissionInput,
  ): Promise<UserDetail> {
    this.notSelf(actor, id);
    const organisation = await this.scopeFor(
      actor,
      'permission.revoke',
      input.organisationId,
    );
    const permission = await this.requirePermission(input.permission);

    await this.prisma.$transaction(async (tx) => {
      await this.requireUser(tx, id);
      const held = await tx.userPermissionRevocation.findUnique({
        where: {
          userId_permissionId_organisationId: {
            userId: id,
            permissionId: permission.id,
            organisationId: organisation.id,
          },
        },
        select: { id: true },
      });
      if (held) {
        throw new ConflictException(
          'That permission is already revoked there.',
        );
      }
      await tx.userPermissionRevocation.create({
        data: {
          userId: id,
          permissionId: permission.id,
          organisationId: organisation.id,
          revokedByUserId: actor.userId,
          reason: input.reason,
        },
      });
      await this.audit.record(
        {
          action: 'user.permission_revoke',
          subjectType: 'user',
          subjectId: id,
          organisationId: organisation.id,
          actorUserId: actor.userId,
          after: {
            permission: input.permission,
            organisationId: organisation.id,
          },
          reason: input.reason,
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );
    });
    return this.get(id);
  }

  async liftRevocation(
    actor: ActorContext,
    id: string,
    revocationId: string,
    reason: string,
  ): Promise<UserDetail> {
    this.notSelf(actor, id);
    const revocation = await this.prisma.userPermissionRevocation.findFirst({
      where: { id: revocationId, userId: id },
      select: {
        id: true,
        organisationId: true,
        permission: { select: { code: true } },
      },
    });
    const organisation = revocation
      ? await this.prisma.organisation.findUnique({
          where: { id: revocation.organisationId },
          select: { id: true, path: true },
        })
      : null;
    if (
      !revocation ||
      !organisation ||
      !(await this.permissions.can(
        actor.userId,
        'permission.revoke',
        organisation.path,
      ))
    ) {
      throw new NotFoundException();
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.userPermissionRevocation.delete({
        where: { id: revocation.id },
      });
      await this.audit.record(
        {
          action: 'user.permission_revocation_lift',
          subjectType: 'user',
          subjectId: id,
          organisationId: organisation.id,
          actorUserId: actor.userId,
          before: {
            permission: revocation.permission.code,
            organisationId: organisation.id,
          },
          reason,
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );
    });
    return this.get(id);
  }

  // --- Internals -----------------------------------------------------------------

  /** One administrator does not change their own access, status, or factor. */
  private notSelf(actor: ActorContext, id: string): void {
    if (actor.userId === id) {
      throw new ForbiddenException();
    }
  }

  private async requireUser(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<void> {
    const row = await tx.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException();
    }
  }

  private async requirePermission(code: string): Promise<{ id: string }> {
    const row = await this.prisma.permission.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException();
    }
    return row;
  }

  /**
   * The organisation a role or permission is being given in, if the actor
   * holds `permission` over it. Otherwise 404, the same as one that does not
   * exist, so identifiers cannot be enumerated.
   */
  private async scopeFor(
    actor: ActorContext,
    permission: string,
    organisationId: string,
  ): Promise<{ id: string; path: string }> {
    const organisation = await this.prisma.organisation.findFirst({
      where: { id: organisationId, isActive: true },
      select: { id: true, path: true },
    });
    if (
      !organisation ||
      !(await this.permissions.can(actor.userId, permission, organisation.path))
    ) {
      throw new NotFoundException();
    }
    return organisation;
  }

  /** Nobody gives what they do not hold in that scope. */
  private async assertNoEscalation(
    actor: ActorContext,
    giving: readonly string[],
    path: string,
  ): Promise<void> {
    const held = await this.permissions.heldAt(actor.userId, giving, path);
    if (escalations(held, giving).length > 0) {
      throw new ForbiddenException();
    }
  }

  private toSummary(row: SummaryRow): UserSummary {
    return {
      id: row.id,
      email: row.email,
      fullName: row.fullName,
      isActive: row.isActive,
      mustChangePassword: row.mustChangePassword,
      secondFactorEnrolled: row.mfaEnabledAt !== null,
      roles: row.roleAssignments.map((assignment) => ({
        id: assignment.id,
        role: assignment.role,
        organisation: assignment.organisation,
        createdAt: assignment.createdAt.toISOString(),
      })),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async toDetail(row: DetailRow): Promise<UserDetail> {
    // A revocation holds an organisation id and no relation; resolve them in
    // one query.
    const organisations = await this.prisma.organisation.findMany({
      where: {
        id: {
          in: row.permissionRevocations.map((entry) => entry.organisationId),
        },
      },
      select: ORGANISATION_REF,
    });
    const byId = new Map(organisations.map((entry) => [entry.id, entry]));
    return {
      ...this.toSummary(row),
      grants: row.permissionGrants.map((grant) => ({
        id: grant.id,
        permission: grant.permission.code,
        organisation: grant.organisation,
        reason: grant.reason,
        by: grant.grantedBy,
        createdAt: grant.createdAt.toISOString(),
      })),
      revocations: row.permissionRevocations.flatMap((revocation) => {
        const organisation = byId.get(revocation.organisationId);
        return organisation
          ? [
              {
                id: revocation.id,
                permission: revocation.permission.code,
                organisation,
                reason: revocation.reason,
                by: revocation.revokedBy,
                createdAt: revocation.createdAt.toISOString(),
              },
            ]
          : [];
      }),
    };
  }
}
