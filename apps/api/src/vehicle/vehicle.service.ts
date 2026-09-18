import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  DeclareVehicleInput,
  DismissDisputeInput,
  SetDeclarationStatusInput,
  UpdateVehicleInput,
  VehicleDetail,
  VehicleSummary,
} from '@nurtw/contracts';
import {
  InvalidDeclarationTransitionError,
  assertDeclarationTransition,
  normalizePlateNumber,
  outermostScopes,
  type DeclarationStatus,
} from '@nurtw/domain';
import { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service.js';
import { PermissionService } from '../auth/permission.service.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const READ = 'vehicle.read';
const READ_RESTRICTED = 'vehicle.read_restricted';
const DECLARE = 'vehicle.declare';
const UPDATE = 'vehicle.update';
const SUSPEND = 'vehicle.suspend';
const RESOLVE_DISPUTE = 'vehicle.resolve_dispute';

/** The fields a `VehicleSummary` needs, and nothing else — see `toSummary`. */
function summarySelect() {
  return {
    id: true,
    plateNumberDisplay: true,
    status: true,
    declaredAt: true,
    isLegacyImport: true,
    vehicleCategory: { select: { id: true, code: true, label: true } },
    branch: { select: { id: true, name: true, level: true } },
    unit: { select: { id: true, name: true, level: true } },
    declaredByMember: {
      select: { id: true, surname: true, firstName: true },
    },
  } satisfies Prisma.VehicleSelect;
}

/** What `resolveDeclaringOrganisation` resolves a branch or unit id into. */
interface DeclaringOrganisation {
  id: string;
  path: string;
  isActive: boolean;
  branchId: string;
  unitId: string | null;
}

interface SummaryRow {
  id: string;
  plateNumberDisplay: string;
  status: string;
  declaredAt: Date;
  isLegacyImport: boolean;
  vehicleCategory: { id: string; code: string; label: string } | null;
  branch: { id: string; name: string; level: string } | null;
  unit: { id: string; name: string; level: string } | null;
  declaredByMember: { id: string; surname: string; firstName: string } | null;
}

/**
 * Vehicle declaration (PRD §9). Record-scoped throughout, the same
 * convention as `MembershipService`: the guard has established only that the
 * caller holds a permission *somewhere*, so every method here re-resolves
 * the record's (or the target organisation's) path and asks `can` against
 * it — otherwise an officer scoped to one branch could act on another
 * branch's declarations.
 *
 * See `plans/07-vehicle-declaration.md` for what this item does and does not
 * cover: dispute *resolution* is dismissal only (`DISPUTED -> ARCHIVED`);
 * upholding a disputed claim is out of scope pending QUESTIONS.md VEH-07.
 */
@Injectable()
export class VehicleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
  ) {}

  // --- Reads -----------------------------------------------------------------

  /**
   * Declarations the caller may see, filtered by organisation subtree.
   *
   * A vehicle is declared against a branch alone, or a unit (which always
   * carries its parent branch too — see `resolveDeclaringOrganisation`). The
   * filter below checks whichever is the more specific: a unit's own path
   * when one is set, the branch's path otherwise. Expressed as a query
   * condition, not app-side filtering after the fact — filtering a
   * `take`-limited page in memory would silently drop visible rows whenever
   * the first page happened to be mostly out of scope.
   */
  async list(
    userId: string,
    filters: { status?: string; organisationId?: string; q?: string },
  ): Promise<VehicleSummary[]> {
    const scopes = await this.readableScopes(userId);
    if (scopes.length === 0) {
      return [];
    }

    // A search box takes partial input as the officer types — "AB", "AB1" —
    // which is shorter than `normalizePlateNumber` accepts for a plate being
    // *stored* (PRD Requirement 9.1's bounds exist to reject junk at that
    // boundary, not to constrain what a search may match against). Folded
    // the same way, without those bounds, so a search still only ever
    // matches the normalised form.
    const q = filters.q
      ?.trim()
      .normalize('NFKD')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');

    const rows = await this.prisma.vehicle.findMany({
      where: {
        ...(filters.status ? { status: filters.status as never } : {}),
        ...(q ? { plateNumberNormalized: { contains: q } } : {}),
        AND: [
          {
            OR: scopes.flatMap((scope) => [
              { unitId: { not: null }, unit: { path: { startsWith: scope } } },
              { unitId: null, branch: { path: { startsWith: scope } } },
            ]),
          },
          ...(filters.organisationId
            ? [
                {
                  OR: [
                    { unitId: filters.organisationId },
                    { branchId: filters.organisationId, unitId: null },
                  ],
                },
              ]
            : []),
        ],
      },
      select: summarySelect(),
      orderBy: { declaredAt: 'desc' },
      take: 200,
    });

    return rows.map((row) => this.toSummary(row));
  }

  async findOne(userId: string, id: string): Promise<VehicleDetail> {
    const vehicle = await this.loadVisible(userId, id);
    const canReadRestricted = await this.permissions.can(
      userId,
      READ_RESTRICTED,
      vehicle.path,
    );

    return {
      ...this.toSummary(vehicle),
      make: vehicle.make,
      model: vehicle.model,
      color: vehicle.color,
      notes: vehicle.notes,
      ...(canReadRestricted
        ? { chassisVinRestricted: vehicle.chassisVinRestricted }
        : {}),
    };
  }

  // --- Declaration -------------------------------------------------------------

  /**
   * PRD §9.5 — a manual, deliberate act by a `vehicle.declare` holder. Scope
   * is checked against the declaring branch or unit's path — a create has no
   * path of its own yet, so this is the "parent's path" rule item 04 set.
   *
   * PRD §23.9 — a plate already carrying an `ACTIVE` declaration refuses the
   * new claim as active but does not drop it: the new row is created
   * `DISPUTED`, preserving both. The pre-check below handles the common
   * case; `createDeclaration`'s catch handles the race where two
   * declarations for the same plate are in flight at once, which the
   * partial unique index (`vehicle_one_active_declaration_per_plate`) is the
   * actual authority on.
   */
  async declare(
    actor: ActorContext,
    input: DeclareVehicleInput,
  ): Promise<VehicleSummary> {
    const organisation = await this.resolveDeclaringOrganisation(
      input.organisationId,
    );
    await this.require(actor.userId, DECLARE, organisation.path);

    if (!organisation.isActive) {
      throw new ConflictException(
        'That organisation is inactive and cannot accept new declarations.',
      );
    }

    const plateNumberNormalized = normalizePlateNumber(
      input.plateNumberDisplay,
    );

    const existingActive = await this.prisma.vehicle.findFirst({
      where: { plateNumberNormalized, status: 'ACTIVE' },
      select: { id: true },
    });
    const initialStatus: DeclarationStatus = existingActive
      ? 'DISPUTED'
      : 'ACTIVE';

    if (input.declaredByMemberId) {
      await this.requireMemberExists(input.declaredByMemberId);
    }

    const created = await this.createDeclaration(
      actor,
      input,
      organisation,
      plateNumberNormalized,
      initialStatus,
    );

    return this.toSummary(created);
  }

  private async createDeclaration(
    actor: ActorContext,
    input: DeclareVehicleInput,
    organisation: DeclaringOrganisation,
    plateNumberNormalized: string,
    status: DeclarationStatus,
  ): Promise<SummaryRow> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const vehicle = await tx.vehicle.create({
          data: {
            plateNumberNormalized,
            plateNumberDisplay: input.plateNumberDisplay,
            vehicleCategoryId: input.vehicleCategoryId ?? null,
            make: input.make ?? null,
            model: input.model ?? null,
            color: input.color ?? null,
            chassisVinRestricted: input.chassisVinRestricted ?? null,
            notes: input.notes ?? null,
            declaredByMemberId: input.declaredByMemberId ?? null,
            branchId: organisation.branchId,
            unitId: organisation.unitId,
            status,
          },
          select: summarySelect(),
        });

        await this.audit.record(
          {
            action: 'vehicle.declare',
            subjectType: 'vehicle',
            subjectId: vehicle.id,
            organisationId: organisation.id,
            actorUserId: actor.userId,
            after: { plateNumberNormalized, status },
            requestId: actor.requestId,
            ipAddress: actor.ipAddress,
          },
          tx,
        );

        return vehicle;
      });
    } catch (error) {
      if (
        status === 'ACTIVE' &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Lost the race: another declaration for this plate committed as
        // ACTIVE between our pre-check and this insert. Record this one as
        // DISPUTED instead of surfacing a 500 for an outcome PRD §23.9
        // already has a defined answer for.
        return this.createDeclaration(
          actor,
          input,
          organisation,
          plateNumberNormalized,
          'DISPUTED',
        );
      }
      throw error;
    }
  }

  async update(
    actor: ActorContext,
    id: string,
    input: UpdateVehicleInput,
  ): Promise<VehicleSummary> {
    const vehicle = await this.loadVisible(actor.userId, id);
    await this.require(actor.userId, UPDATE, vehicle.path);

    let destination: DeclaringOrganisation | null = null;
    if (input.organisationId) {
      destination = await this.resolveDeclaringOrganisation(
        input.organisationId,
      );
      // Moving a declaration into another branch or unit needs the
      // permission there too — a move checks both ends, the same reason
      // moving an organisation node itself does.
      await this.require(actor.userId, UPDATE, destination.path);
    }

    const plateNumberNormalized = input.plateNumberDisplay
      ? normalizePlateNumber(input.plateNumberDisplay)
      : undefined;

    if (input.declaredByMemberId) {
      await this.requireMemberExists(input.declaredByMemberId);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.vehicle.update({
        where: { id },
        data: {
          ...(plateNumberNormalized
            ? {
                plateNumberNormalized,
                plateNumberDisplay: input.plateNumberDisplay,
              }
            : {}),
          ...(input.vehicleCategoryId !== undefined
            ? { vehicleCategoryId: input.vehicleCategoryId }
            : {}),
          ...(input.make !== undefined ? { make: input.make } : {}),
          ...(input.model !== undefined ? { model: input.model } : {}),
          ...(input.color !== undefined ? { color: input.color } : {}),
          ...(input.chassisVinRestricted !== undefined
            ? { chassisVinRestricted: input.chassisVinRestricted }
            : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.declaredByMemberId !== undefined
            ? { declaredByMemberId: input.declaredByMemberId }
            : {}),
          ...(destination
            ? { branchId: destination.branchId, unitId: destination.unitId }
            : {}),
        },
        select: summarySelect(),
      });

      await this.audit.record(
        {
          action: 'vehicle.update',
          subjectType: 'vehicle',
          subjectId: id,
          organisationId: destination?.id ?? vehicle.organisationId,
          actorUserId: actor.userId,
          after: { fieldsAmended: Object.keys(input) },
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return result;
    });

    return this.toSummary(updated);
  }

  /** `ACTIVE`, `SUSPENDED`, `RETIRED` only — see `setDeclarationStatusSchema`. */
  async setStatus(
    actor: ActorContext,
    id: string,
    input: SetDeclarationStatusInput,
  ): Promise<{ id: string; status: string }> {
    const vehicle = await this.loadVisible(actor.userId, id);
    await this.require(actor.userId, SUSPEND, vehicle.path);

    this.assertTransition(vehicle.status as DeclarationStatus, input.status);

    return this.applyStatus(actor, vehicle, input.status, input.reason);
  }

  /** `DISPUTED -> ARCHIVED` only. See the class doc for what this does not do. */
  async dismissDispute(
    actor: ActorContext,
    id: string,
    input: DismissDisputeInput,
  ): Promise<{ id: string; status: string }> {
    const vehicle = await this.loadVisible(actor.userId, id);
    await this.require(actor.userId, RESOLVE_DISPUTE, vehicle.path);

    this.assertTransition(vehicle.status as DeclarationStatus, 'ARCHIVED');

    return this.applyStatus(actor, vehicle, 'ARCHIVED', input.reason);
  }

  /** Translates an illegal transition into 409, matching `card.service.ts` and `membership.service.ts`. */
  private assertTransition(from: DeclarationStatus, to: DeclarationStatus): void {
    try {
      assertDeclarationTransition(from, to);
    } catch (error) {
      if (error instanceof InvalidDeclarationTransitionError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  private async applyStatus(
    actor: ActorContext,
    vehicle: { id: string; status: string; organisationId: string },
    status: DeclarationStatus,
    reason: string,
  ): Promise<{ id: string; status: string }> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.vehicle.update({
        where: { id: vehicle.id },
        data: { status },
        select: { id: true, status: true },
      });

      await this.audit.record(
        {
          action: 'vehicle.status_change',
          subjectType: 'vehicle',
          subjectId: vehicle.id,
          organisationId: vehicle.organisationId,
          actorUserId: actor.userId,
          before: { status: vehicle.status },
          after: { status },
          reason,
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return updated;
    });
  }

  // --- Helpers -----------------------------------------------------------------

  private async readableScopes(userId: string): Promise<string[]> {
    const held = await this.permissions.listFor(userId);
    return outermostScopes(
      held
        .filter((entry) => entry.permission === READ)
        .map((entry) => entry.scopePath),
    );
  }

  /**
   * Loads a declaration the caller may read, or 404 — identical to "does not
   * exist" so an out-of-scope identifier cannot be enumerated.
   */
  private async loadVisible(userId: string, id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: {
        vehicleCategory: { select: { id: true, code: true, label: true } },
        branch: { select: { id: true, name: true, level: true, path: true } },
        unit: { select: { id: true, name: true, level: true, path: true } },
        declaredByMember: {
          select: { id: true, surname: true, firstName: true },
        },
      },
    });
    if (!vehicle) {
      throw new NotFoundException();
    }
    const organisation = vehicle.unit ?? vehicle.branch;
    if (!organisation) {
      throw new NotFoundException();
    }
    const allowed = await this.permissions.can(
      userId,
      READ,
      organisation.path,
    );
    if (!allowed) {
      throw new NotFoundException();
    }
    return {
      ...vehicle,
      path: organisation.path,
      organisationId: organisation.id,
    };
  }

  /**
   * Resolves the branch or unit a declaration is made against, and the
   * `Vehicle.branchId`/`unitId` pair it implies. A unit's branch is its
   * direct parent — the hierarchy never skips a level (item 04).
   */
  private async resolveDeclaringOrganisation(
    organisationId: string,
  ): Promise<DeclaringOrganisation> {
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: organisationId },
    });
    if (!organisation) {
      throw new NotFoundException();
    }
    if (organisation.level === 'UNIT') {
      if (!organisation.parentId) {
        throw new ConflictException('That unit has no parent branch.');
      }
      return {
        id: organisation.id,
        path: organisation.path,
        isActive: organisation.isActive,
        branchId: organisation.parentId,
        unitId: organisation.id,
      };
    }
    if (organisation.level === 'BRANCH') {
      return {
        id: organisation.id,
        path: organisation.path,
        isActive: organisation.isActive,
        branchId: organisation.id,
        unitId: null,
      };
    }
    throw new ConflictException(
      `A vehicle is declared against a branch or unit, not a ${organisation.level.toLowerCase()}.`,
    );
  }

  /**
   * A declaring officer need not hold `member.read` in the member's own
   * scope to attach them — the officer is recording who operates the
   * vehicle in their own branch or unit, not reading that member's file.
   * Existence is all that is checked; a non-existent id answers 404 rather
   * than silently writing a dangling foreign key.
   */
  private async requireMemberExists(memberId: string): Promise<void> {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException('No such member.');
    }
  }

  private async require(
    userId: string,
    permission: string,
    path: string,
  ): Promise<void> {
    if (!(await this.permissions.can(userId, permission, path))) {
      throw new ForbiddenException();
    }
  }

  private toSummary(row: SummaryRow): VehicleSummary {
    const organisation = row.unit ?? row.branch;
    if (!organisation) {
      // Structurally impossible: every declaration is created with a branch
      // or a unit. Not a caller error, so not a NotFoundException.
      throw new Error('A vehicle record carries no organisation.');
    }
    return {
      id: row.id,
      plateNumberDisplay: row.plateNumberDisplay,
      status: row.status,
      declaredAt: row.declaredAt.toISOString(),
      isLegacyImport: row.isLegacyImport,
      vehicleCategory: row.vehicleCategory,
      organisation,
      declaredByMember: row.declaredByMember,
    };
  }
}
