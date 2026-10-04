import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateRoleInput,
  RoleSummary,
  UpdateRoleInput,
} from '@nurtw/contracts';
import { escalations } from '@nurtw/domain';
import type { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service.js';
import { PermissionService } from '../auth/permission.service.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const ROLE_SELECT = {
  id: true,
  code: true,
  label: true,
  description: true,
  isSystem: true,
  permissions: { select: { permission: { select: { code: true } } } },
  _count: { select: { assignments: true } },
} as const;

type RoleRow = Prisma.RoleGetPayload<{ select: typeof ROLE_SELECT }>;

/**
 * Roles (PRD §16, ARCHITECTURE.md Decision 9.5 — item 28).
 *
 * - **The roles of PRD §16 are immutable.** A misconfiguration cannot quietly
 *   widen a role the Union believes it understands. The seed owns them.
 * - **The Union composes further roles** from the permission catalogue. A
 *   composed role may never hold a permission that is given only by express
 *   grant (`vehicle.declare`, the settlement account): the contract refuses
 *   it before this service runs.
 * - **Nobody composes what they do not hold.** Amending a role changes what
 *   each holder may do from their next request, with no assignment step to
 *   check it, so the author must hold every permission they put in it.
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly permissions: PermissionService,
  ) {}

  async list(): Promise<RoleSummary[]> {
    const rows = await this.prisma.role.findMany({
      select: ROLE_SELECT,
      orderBy: [{ isSystem: 'desc' }, { label: 'asc' }],
    });
    return rows.map((row) => this.toSummary(row));
  }

  async create(
    actor: ActorContext,
    input: CreateRoleInput,
  ): Promise<RoleSummary> {
    await this.assertHolds(actor, input.permissions);
    const permissionIds = await this.permissionIds(input.permissions);

    await this.prisma.$transaction(async (tx) => {
      const taken = await tx.role.findUnique({
        where: { code: input.code },
        select: { id: true },
      });
      if (taken) {
        throw new ConflictException('A role with that code exists.');
      }
      const role = await tx.role.create({
        data: {
          code: input.code,
          label: input.label,
          description: input.description || null,
          isSystem: false,
          permissions: {
            create: permissionIds.map((permissionId) => ({ permissionId })),
          },
        },
        select: { id: true },
      });
      await this.audit.record(
        {
          action: 'role.create',
          subjectType: 'role',
          subjectId: role.id,
          actorUserId: actor.userId,
          after: {
            code: input.code,
            label: input.label,
            permissions: [...input.permissions].sort(),
          },
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );
    });
    return this.get(input.code);
  }

  async update(
    actor: ActorContext,
    code: string,
    input: UpdateRoleInput,
  ): Promise<RoleSummary> {
    await this.assertHolds(actor, input.permissions);
    const permissionIds = await this.permissionIds(input.permissions);

    await this.prisma.$transaction(async (tx) => {
      const before = await tx.role.findUnique({
        where: { code },
        select: ROLE_SELECT,
      });
      if (!before) {
        throw new NotFoundException();
      }
      if (before.isSystem) {
        throw new ConflictException('A system role cannot be changed.');
      }
      await tx.rolePermission.deleteMany({ where: { roleId: before.id } });
      await tx.role.update({
        where: { id: before.id },
        data: {
          label: input.label,
          description: input.description || null,
          permissions: {
            create: permissionIds.map((permissionId) => ({ permissionId })),
          },
        },
      });
      await this.audit.record(
        {
          action: 'role.update',
          subjectType: 'role',
          subjectId: before.id,
          actorUserId: actor.userId,
          before: {
            label: before.label,
            permissions: before.permissions
              .map((entry) => entry.permission.code)
              .sort(),
          },
          after: {
            label: input.label,
            permissions: [...input.permissions].sort(),
          },
          reason: input.reason,
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );
    });
    return this.get(code);
  }

  private async get(code: string): Promise<RoleSummary> {
    const row = await this.prisma.role.findUnique({
      where: { code },
      select: ROLE_SELECT,
    });
    if (!row) {
      throw new NotFoundException();
    }
    return this.toSummary(row);
  }

  private async assertHolds(
    actor: ActorContext,
    giving: readonly string[],
  ): Promise<void> {
    const held = await this.permissions.heldAnywhere(actor.userId, giving);
    if (escalations(held, giving).length > 0) {
      throw new ForbiddenException();
    }
  }

  private async permissionIds(codes: readonly string[]): Promise<string[]> {
    const rows = await this.prisma.permission.findMany({
      where: { code: { in: [...codes] } },
      select: { id: true },
    });
    if (rows.length !== codes.length) {
      throw new NotFoundException();
    }
    return rows.map((row) => row.id);
  }

  private toSummary(row: RoleRow): RoleSummary {
    return {
      code: row.code,
      label: row.label,
      description: row.description,
      isSystem: row.isSystem,
      permissions: row.permissions.map((entry) => entry.permission.code).sort(),
      assignmentCount: row._count.assignments,
    };
  }
}
