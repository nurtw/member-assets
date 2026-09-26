import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  DeclareRecordedVehicleInput,
  DeclareVehicleInput,
  DismissDisputeInput,
  RecordVehicleInput,
  SetDeclarationStatusInput,
  UpdateVehicleInput,
  VehicleDetail,
  VehicleOwnerInput,
  VehicleSummary,
} from '@nurtw/contracts';
import {
  InvalidDeclarationTransitionError,
  RECORD_BLOCKING_STATUSES,
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
const RECORD = 'vehicle.record';
const UPDATE = 'vehicle.update';
const SUSPEND = 'vehicle.suspend';
const RESOLVE_DISPUTE = 'vehicle.resolve_dispute';

/**
 * The reason recorded for refusing a plate that already has a standing record.
 * The caller receives only the generic conflict (Requirement 14.3), and even
 * this internal text says nothing about where the record is: it may sit
 * outside the caller's read scope (Decision 6.6).
 */
const ALREADY_RECORDED =
  'A record for this plate number already exists. Recording is for adding vehicles; to claim one already recorded, it must be declared.';

/** The fields a `VehicleSummary` needs, and nothing else — see `toSummary`. */
function summarySelect() {
  return {
    id: true,
    plateNumberDisplay: true,
    status: true,
    declaredAt: true,
    isLegacyImport: true,
    vehicleCategory: { select: { id: true, code: true, label: true } },
    routeType: { select: { id: true, code: true, label: true } },
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
  declaredAt: Date | null;
  isLegacyImport: boolean;
  vehicleCategory: { id: string; code: string; label: string } | null;
  routeType: { id: string; code: string; label: string } | null;
  branch: { id: string; name: string; level: string } | null;
  unit: { id: string; name: string; level: string } | null;
  declaredByMember: { id: string; surname: string; firstName: string } | null;
}

/** An `ON_RECORD` row being declared, as `promote` needs it. */
interface RecordedVehicle {
  id: string;
  status: string;
  organisationId: string;
  routeTypeId: string | null;
  declaredByMemberId: string | null;
  notes: string | null;
  owner: { ownerName: string | null; ownerPhone: string | null } | null;
}

/** The descriptive fields a declaration may update on the row it promotes. */
interface PromotionFields {
  routeTypeId?: string;
  declaredByMemberId?: string;
  owner?: VehicleOwnerInput;
  vehicleCategoryId?: string;
  make?: string;
  model?: string;
  color?: string;
  chassisVinRestricted?: string;
  notes?: string;
}

/**
 * Vehicle records and declarations (PRD §9). Record-scoped throughout, the
 * same convention as `MembershipService`: the guard has established only that
 * the caller holds a permission *somewhere*, so every method here re-resolves
 * the record's (or the target organisation's) path and asks `can` against
 * it — otherwise an officer scoped to one branch could act on another
 * branch's vehicles.
 *
 * Two ways in, one row per vehicle (ARCHITECTURE.md Decisions 6.5–6.6):
 *
 * - `record()` (`vehicle.record`, revision 1.3) adds a vehicle ON_RECORD. It is
 *   not a declaration and never produces one.
 * - `declare()` / `declareRecorded()` (`vehicle.declare`) make a declaration.
 *   Where the plate is already ON_RECORD, the SAME row is promoted — a second
 *   row beside it would give one physical vehicle two records.
 *
 * See `plans/07-vehicle-declaration.md` for dispute handling: resolution is
 * dismissal only (`DISPUTED -> ARCHIVED`); upholding a disputed claim is out of
 * scope pending QUESTIONS.md VEH-07.
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
   * Vehicles the caller may see, filtered by organisation subtree.
   *
   * A vehicle belongs to a branch alone, or a unit (which always carries its
   * parent branch too — see `resolveDeclaringOrganisation`). The filter below
   * checks whichever is the more specific: a unit's own path when one is set,
   * the branch's path otherwise. Expressed as a query condition, not app-side
   * filtering after the fact — filtering a `take`-limited page in memory would
   * silently drop visible rows whenever the first page happened to be mostly
   * out of scope.
   *
   * No owner field is selected. Requirement 9.8 keeps owner details off every
   * list, the same projection rule Requirement 7.1 applies to members.
   */
  async list(
    userId: string,
    filters: {
      status?: string;
      organisationId?: string;
      q?: string;
      memberId?: string;
    },
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
        // Requirement 9.10 — the registration flow lists an applicant's
        // vehicles. Still inside the scope filter below: naming a member does
        // not widen what the caller may see.
        ...(filters.memberId ? { declaredByMemberId: filters.memberId } : {}),
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
      // ON_RECORD rows have no declaration date; without `nulls: 'last'`
      // PostgreSQL sorts NULL first under DESC and every recorded vehicle
      // would crowd the declared ones off the first page.
      orderBy: [
        { declaredAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
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

    // Requirement 9A.1 / Decision 6.5 — onboarded is read from the attached
    // sticker, never from the vehicle. The barcode is selected only to tell
    // the two kinds apart; the sticker number stays behind `sticker.attach`.
    const [attached, letter] = await Promise.all([
      this.prisma.sticker.findFirst({
        where: { vehicleId: vehicle.id, attachedAt: { not: null } },
        orderBy: { attachedAt: 'desc' },
        select: {
          legacyBarcode: true,
          attachedAt: true,
          status: true,
          attachedByUser: { select: { fullName: true } },
        },
      }),
      this.prisma.vehicleLetter.findFirst({
        where: { vehicleId: vehicle.id },
        orderBy: { issuedAt: 'desc' },
        select: { letterReference: true },
      }),
    ]);

    return {
      ...this.toSummary(vehicle),
      make: vehicle.make,
      model: vehicle.model,
      color: vehicle.color,
      notes: vehicle.notes,
      ...(canReadRestricted
        ? { chassisVinRestricted: vehicle.chassisVinRestricted }
        : {}),
      owner: vehicle.owner
        ? {
            name: vehicle.owner.ownerName,
            phone: vehicle.owner.ownerPhone,
            address: vehicle.owner.ownerAddress,
          }
        : null,
      onboarding:
        attached && attached.attachedAt
          ? {
              kind: attached.legacyBarcode ? 'LEGACY' : 'SIGNED',
              attachedAt: attached.attachedAt.toISOString(),
              attachedBy: attached.attachedByUser?.fullName ?? null,
              stickerStatus: attached.status,
              letterReference: letter?.letterReference ?? null,
            }
          : null,
    };
  }

  // --- Recording (revision 1.3) ------------------------------------------------

  /**
   * PRD Requirement 9.7 — adds a vehicle ON_RECORD. Scope is checked against
   * the branch or unit it is recorded under (the "parent's path" rule for a
   * create, item 04).
   *
   * A plate with a standing record is refused, not disputed (Decision 6.6):
   * recording adds vehicles, it does not claim them. The pre-check covers
   * every standing status; the partial unique index
   * `vehicle_one_on_record_per_plate` is the authority on the race where two
   * enumerators record the same plate at once.
   */
  async record(
    actor: ActorContext,
    input: RecordVehicleInput,
  ): Promise<VehicleSummary> {
    const organisation = await this.resolveDeclaringOrganisation(
      input.organisationId,
    );
    await this.require(actor.userId, RECORD, organisation.path);

    if (!organisation.isActive) {
      throw new ConflictException(
        'That organisation is inactive and cannot accept new vehicles.',
      );
    }

    const plateNumberNormalized = normalizePlateNumber(
      input.plateNumberDisplay,
    );
    await this.requireRouteType(input.routeTypeId);
    if (input.declaredByMemberId) {
      await this.requireMemberExists(input.declaredByMemberId);
    }

    const standing = await this.prisma.vehicle.findFirst({
      where: {
        plateNumberNormalized,
        status: { in: [...RECORD_BLOCKING_STATUSES] },
      },
      select: { id: true },
    });
    if (standing) {
      throw new ConflictException(ALREADY_RECORDED);
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const vehicle = await tx.vehicle.create({
          data: {
            ...this.descriptiveFields(input),
            plateNumberNormalized,
            plateNumberDisplay: input.plateNumberDisplay,
            routeTypeId: input.routeTypeId,
            declaredByMemberId: input.declaredByMemberId ?? null,
            branchId: organisation.branchId,
            unitId: organisation.unitId,
            status: 'ON_RECORD',
            // Decision 6.5 — explicitly null, overriding the column's now()
            // default. Recording is not declaring.
            declaredAt: null,
            owner: { create: this.ownerColumns(input.owner) },
          },
          select: summarySelect(),
        });

        await this.audit.record(
          {
            action: 'vehicle.record',
            subjectType: 'vehicle',
            subjectId: vehicle.id,
            organisationId: organisation.id,
            actorUserId: actor.userId,
            // Owner details are not copied into the audit trail — the fact
            // that they were recorded is, their values stay in their table.
            after: {
              plateNumberNormalized,
              status: 'ON_RECORD',
              routeTypeId: input.routeTypeId,
              ownerRecorded: true,
            },
            requestId: actor.requestId,
            ipAddress: actor.ipAddress,
          },
          tx,
        );

        return vehicle;
      });

      return this.toSummary(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(ALREADY_RECORDED);
      }
      throw error;
    }
  }

  // --- Declaration -------------------------------------------------------------

  /**
   * PRD §9.5 — a manual, deliberate act by a `vehicle.declare` holder. Scope
   * is checked against the declaring branch or unit's path — a create has no
   * path of its own yet, so this is the "parent's path" rule item 04 set.
   *
   * In order (Decision 6.5):
   *
   * 1. A plate already carrying an `ACTIVE` declaration: PRD §23.9 refuses the
   *    new claim as active but does not drop it — a new row is created
   *    `DISPUTED`, preserving both.
   * 2. A plate ON_RECORD: that same row is promoted, not duplicated — subject
   *    to the declarer's scope over where it currently sits (Decision 6.6).
   * 3. Otherwise a new `ACTIVE` row.
   *
   * The pre-check handles the common case; `createDeclaration`'s catch handles
   * the race where two declarations for the same plate are in flight at once,
   * which the partial unique index (`vehicle_one_active_declaration_per_plate`)
   * is the actual authority on.
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
    await this.requireRouteType(input.routeTypeId);
    if (input.declaredByMemberId) {
      await this.requireMemberExists(input.declaredByMemberId);
    }

    const existingActive = await this.prisma.vehicle.findFirst({
      where: { plateNumberNormalized, status: 'ACTIVE' },
      select: { id: true },
    });

    if (!existingActive) {
      const recorded = await this.findRecorded({ plateNumberNormalized });
      if (recorded) {
        if (!(await this.permissions.can(actor.userId, DECLARE, recorded.path))) {
          throw new ConflictException(
            'A vehicle with this plate number is already on record outside your area. An administrator must move that record before it can be declared here.',
          );
        }
        const promoted = await this.promote(actor, recorded, organisation, {
          routeTypeId: input.routeTypeId,
          declaredByMemberId: input.declaredByMemberId,
          owner: input.owner,
          vehicleCategoryId: input.vehicleCategoryId,
          make: input.make,
          model: input.model,
          color: input.color,
          chassisVinRestricted: input.chassisVinRestricted,
          notes: input.notes,
        });
        return this.toSummary(promoted);
      }
    }

    const created = await this.createDeclaration(
      actor,
      input,
      organisation,
      plateNumberNormalized,
      existingActive ? 'DISPUTED' : 'ACTIVE',
    );

    return this.toSummary(created);
  }

  /**
   * Declares a vehicle already ON_RECORD from its own page (Decision 6.6).
   *
   * The declarer needs `vehicle.declare` over where the record sits now and,
   * when `organisationId` moves it, over the destination too — a declaration
   * that relocates the record is also a move, and a move checks both ends.
   *
   * Whatever the record lacks must arrive here: a legacy row has no route type
   * and may have no owner phone, and a declaration is refused until the result
   * meets Requirements 9.8–9.9.
   */
  async declareRecorded(
    actor: ActorContext,
    id: string,
    input: DeclareRecordedVehicleInput,
  ): Promise<VehicleSummary> {
    const vehicle = await this.loadVisible(actor.userId, id);
    if (vehicle.status !== 'ON_RECORD') {
      throw new ConflictException(
        'Only a vehicle on record can be declared this way. This one is already declared, or has left the register.',
      );
    }
    await this.require(actor.userId, DECLARE, vehicle.path);

    let destination: DeclaringOrganisation = {
      id: vehicle.organisationId,
      path: vehicle.path,
      isActive: vehicle.organisationIsActive,
      branchId: vehicle.branchId!,
      unitId: vehicle.unitId,
    };
    if (input.organisationId) {
      destination = await this.resolveDeclaringOrganisation(
        input.organisationId,
      );
      await this.require(actor.userId, DECLARE, destination.path);
    }
    if (!destination.isActive) {
      throw new ConflictException(
        'That organisation is inactive and cannot accept new declarations.',
      );
    }

    if (input.routeTypeId) {
      await this.requireRouteType(input.routeTypeId);
    }
    if (input.declaredByMemberId) {
      await this.requireMemberExists(input.declaredByMemberId);
    }

    const existingActive = await this.prisma.vehicle.findFirst({
      where: {
        plateNumberNormalized: vehicle.plateNumberNormalized,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (existingActive) {
      throw new ConflictException(
        'This plate number already has an active declaration. A competing claim is made as a new declaration, and is recorded as disputed.',
      );
    }

    const promoted = await this.promote(
      actor,
      {
        id: vehicle.id,
        status: vehicle.status,
        organisationId: vehicle.organisationId,
        routeTypeId: vehicle.routeTypeId,
        declaredByMemberId: vehicle.declaredByMemberId,
        notes: vehicle.notes,
        owner: vehicle.owner,
      },
      destination,
      {
        routeTypeId: input.routeTypeId,
        declaredByMemberId: input.declaredByMemberId,
        owner: input.owner,
      },
    );
    return this.toSummary(promoted);
  }

  /**
   * `ON_RECORD -> ACTIVE` on the same row (Decision 6.5). Stamps `declaredAt`,
   * moves the row to the declaring organisation, and applies whatever
   * descriptive fields the declaration supplied. Refuses unless the result has
   * a route type and an owner name and phone (Requirements 9.8–9.9).
   */
  private async promote(
    actor: ActorContext,
    recorded: RecordedVehicle,
    destination: DeclaringOrganisation,
    fields: PromotionFields,
  ): Promise<SummaryRow> {
    this.assertTransition(recorded.status as DeclarationStatus, 'ACTIVE');

    if (!(fields.routeTypeId ?? recorded.routeTypeId)) {
      throw new BadRequestException(
        'A route type is required to declare this vehicle.',
      );
    }
    const ownerName = fields.owner?.name ?? recorded.owner?.ownerName;
    const ownerPhone = fields.owner?.phone ?? recorded.owner?.ownerPhone;
    if (!ownerName || !ownerPhone) {
      throw new BadRequestException(
        "The owner's name and phone number are required to declare this vehicle.",
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const { notes, ...descriptive } = fields;
        const vehicle = await tx.vehicle.update({
          where: { id: recorded.id },
          data: {
            ...this.descriptiveFields(descriptive),
            // Appended, never replaced: a migrated record's notes carry the
            // legacy status MIG-06 has yet to rule on (plan 09).
            ...(notes
              ? {
                  notes: recorded.notes
                    ? `${recorded.notes}\n\n${notes}`
                    : notes,
                }
              : {}),
            ...(fields.routeTypeId ? { routeTypeId: fields.routeTypeId } : {}),
            ...(fields.declaredByMemberId
              ? { declaredByMemberId: fields.declaredByMemberId }
              : {}),
            branchId: destination.branchId,
            unitId: destination.unitId,
            status: 'ACTIVE',
            declaredAt: new Date(),
            ...(fields.owner
              ? {
                  owner: {
                    upsert: {
                      create: this.ownerColumns(fields.owner),
                      update: this.ownerColumns(fields.owner),
                    },
                  },
                }
              : {}),
          },
          select: summarySelect(),
        });

        await this.audit.record(
          {
            action: 'vehicle.declare',
            subjectType: 'vehicle',
            subjectId: vehicle.id,
            organisationId: destination.id,
            actorUserId: actor.userId,
            before: {
              status: recorded.status,
              organisationId: recorded.organisationId,
            },
            after: {
              status: 'ACTIVE',
              organisationId: destination.id,
              promotedFromOnRecord: true,
              fieldsAmended: Object.keys(fields).filter(
                (key) => fields[key as keyof PromotionFields] !== undefined,
              ),
            },
            requestId: actor.requestId,
            ipAddress: actor.ipAddress,
          },
          tx,
        );

        return vehicle;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Another declaration for this plate committed as ACTIVE between the
        // pre-check and this update.
        throw new ConflictException(
          'This plate number was declared by someone else a moment ago. Reload the vehicle to see its current state.',
        );
      }
      throw error;
    }
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
            ...this.descriptiveFields(input),
            plateNumberNormalized,
            plateNumberDisplay: input.plateNumberDisplay,
            routeTypeId: input.routeTypeId,
            declaredByMemberId: input.declaredByMemberId ?? null,
            branchId: organisation.branchId,
            unitId: organisation.unitId,
            status,
            owner: { create: this.ownerColumns(input.owner) },
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
      // Moving a vehicle into another branch or unit needs the permission
      // there too — a move checks both ends, the same reason moving an
      // organisation node itself does.
      await this.require(actor.userId, UPDATE, destination.path);
    }

    const plateNumberNormalized = input.plateNumberDisplay
      ? normalizePlateNumber(input.plateNumberDisplay)
      : undefined;

    if (input.declaredByMemberId) {
      await this.requireMemberExists(input.declaredByMemberId);
    }
    if (input.routeTypeId) {
      await this.requireRouteType(input.routeTypeId);
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
          ...(input.routeTypeId !== undefined
            ? { routeTypeId: input.routeTypeId }
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
          ...(input.owner
            ? {
                owner: {
                  upsert: {
                    create: this.ownerColumns(input.owner),
                    update: this.ownerColumns(input.owner),
                  },
                },
              }
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
   * Loads a vehicle the caller may read, or 404 — identical to "does not
   * exist" so an out-of-scope identifier cannot be enumerated.
   */
  private async loadVisible(userId: string, id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: {
        vehicleCategory: { select: { id: true, code: true, label: true } },
        routeType: { select: { id: true, code: true, label: true } },
        branch: {
          select: { id: true, name: true, level: true, path: true, isActive: true },
        },
        unit: {
          select: { id: true, name: true, level: true, path: true, isActive: true },
        },
        declaredByMember: {
          select: { id: true, surname: true, firstName: true },
        },
        owner: {
          select: { ownerName: true, ownerPhone: true, ownerAddress: true },
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
      organisationIsActive: organisation.isActive,
    };
  }

  /**
   * The ON_RECORD row for a plate, with the path its scope is judged by.
   * Deliberately not scope-filtered: `declare()` must know a record exists
   * even outside the caller's area, so it refuses rather than duplicates.
   */
  private async findRecorded(where: {
    plateNumberNormalized: string;
  }): Promise<(RecordedVehicle & { path: string }) | null> {
    const row = await this.prisma.vehicle.findFirst({
      where: { ...where, status: 'ON_RECORD' },
      select: {
        id: true,
        status: true,
        routeTypeId: true,
        declaredByMemberId: true,
        notes: true,
        branch: { select: { id: true, path: true } },
        unit: { select: { id: true, path: true } },
        owner: { select: { ownerName: true, ownerPhone: true } },
      },
    });
    if (!row) {
      return null;
    }
    const organisation = row.unit ?? row.branch;
    if (!organisation) {
      throw new Error('A vehicle record carries no organisation.');
    }
    return {
      id: row.id,
      status: row.status,
      organisationId: organisation.id,
      path: organisation.path,
      routeTypeId: row.routeTypeId,
      declaredByMemberId: row.declaredByMemberId,
      notes: row.notes,
      owner: row.owner,
    };
  }

  /**
   * Resolves the branch or unit a vehicle is recorded or declared against,
   * and the `Vehicle.branchId`/`unitId` pair it implies. A unit's branch is
   * its direct parent — the hierarchy never skips a level (item 04).
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
   * An officer recording or declaring a vehicle need not hold `member.read`
   * in the member's own scope to attach them — the officer is recording who
   * operates the vehicle in their own branch or unit, not reading that
   * member's file. Existence is all that is checked, so a pending applicant
   * qualifies (Requirement 9.10); a non-existent id answers 404 rather than
   * silently writing a dangling foreign key.
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

  /** A route type must exist and be offered for new records (master data, §23.4). */
  private async requireRouteType(routeTypeId: string): Promise<void> {
    const routeType = await this.prisma.routeType.findUnique({
      where: { id: routeTypeId },
      select: { isActive: true },
    });
    if (!routeType || !routeType.isActive) {
      throw new BadRequestException('Choose one of the listed route types.');
    }
  }

  /** The optional descriptive columns, set only where supplied. */
  private descriptiveFields(input: {
    vehicleCategoryId?: string;
    make?: string;
    model?: string;
    color?: string;
    chassisVinRestricted?: string;
    notes?: string;
  }) {
    return {
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
    };
  }

  private ownerColumns(owner: VehicleOwnerInput) {
    return {
      ownerName: owner.name,
      ownerPhone: owner.phone,
      ownerAddress: owner.address && owner.address.length > 0 ? owner.address : null,
    };
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
      // Structurally impossible: every vehicle is created with a branch or a
      // unit. Not a caller error, so not a NotFoundException.
      throw new Error('A vehicle record carries no organisation.');
    }
    return {
      id: row.id,
      plateNumberDisplay: row.plateNumberDisplay,
      status: row.status,
      // ON_RECORD rows carry no declaration date (Decision 6.5) — null,
      // not a fabricated timestamp.
      declaredAt: row.declaredAt?.toISOString() ?? null,
      isLegacyImport: row.isLegacyImport,
      vehicleCategory: row.vehicleCategory,
      routeType: row.routeType,
      organisation,
      declaredByMember: row.declaredByMember,
    };
  }
}
