import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  AddedVehicle,
  AddedVehiclesQuery,
  AddedVehiclesResponse,
  MemberCounts,
  OnboardingReport,
  OnboardingReportQuery,
  OwnWork,
  StickerOriginCounts,
  VehicleCounts,
} from '@nurtw/contracts';
import {
  decidePermission,
  lagosDay,
  lagosDayBegins,
  listEffectivePermissions,
  outermostScopes,
  readDayRange,
  tallyOnboarding,
  type OnboardingEvent,
  type PermissionAssignments,
} from '@nurtw/domain';
import type { Prisma } from '@prisma/client';

import { PermissionService } from '../auth/permission.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const DAY_MS = 86_400_000;

/**
 * Counts and lists for officers (roadmap items 64 to 67, `QUESTIONS.md` VEH-41,
 * VEH-42, GOV-25).
 *
 * **Nothing here reads more than the caller's lists do.** Each figure is taken
 * over the organisations in which the caller holds the permission that opens the
 * matching list (`sticker.read`, `vehicle.read`, `member.read`, `report.read`),
 * judged as the lists judge it: a vehicle by its unit's path, or its branch's when
 * it has no unit. A revocation narrower than a grant is honoured, because the
 * scopes come from the effective permissions.
 *
 * Read-only: there is no write in this file but the audit-free reads.
 */
@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
  ) {}

  // --- Item 64: stickers by origin ---------------------------------------------

  /**
   * How many stickers are from the imported register and how many were added
   * through the System (taken into stock, or signed), and how many of each are
   * attached to a vehicle. The attached count is over vehicles in the caller's
   * `sticker.read` scope. The total includes stickers not yet attached, which
   * belong to no branch, so it goes only to a caller whose scope is a whole
   * council; anyone else gets `null`.
   */
  async stickerOrigins(userId: string): Promise<StickerOriginCounts> {
    const assignments = await this.permissions.loadAssignments(userId);
    const scopes = this.scopesHolding(assignments, 'sticker.read');
    const wholeUnion =
      scopes.length > 0 &&
      (await this.prisma.organisation.count({
        where: { level: 'COUNCIL', path: { in: scopes } },
      })) > 0;

    const kinds = {
      imported: { registeredPlateNormalized: { not: null } },
      stock: {
        registeredPlateNormalized: null,
        legacyBarcode: { not: null },
        stockAddedAt: { not: null },
      },
      signed: { legacyBarcode: null },
    } satisfies Record<string, Prisma.StickerWhereInput>;

    const attachedIn = (kind: Prisma.StickerWhereInput) =>
      this.prisma.sticker.count({
        where: {
          ...kind,
          attachedAt: { not: null },
          vehicle: this.vehicleScope(scopes),
        },
      });
    const held = (kind: Prisma.StickerWhereInput) =>
      wholeUnion
        ? this.prisma.sticker.count({
            where: { ...kind, status: { not: 'CANCELLED' } },
          })
        : Promise.resolve(null);

    const [
      importedAttached,
      stockAttached,
      signedAttached,
      importedTotal,
      stockTotal,
      signedTotal,
    ] = await Promise.all([
      attachedIn(kinds.imported),
      attachedIn(kinds.stock),
      attachedIn(kinds.signed),
      held(kinds.imported),
      held(kinds.stock),
      held(kinds.signed),
    ]);

    return {
      imported: { total: importedTotal, attached: importedAttached },
      added: {
        total:
          stockTotal === null || signedTotal === null
            ? null
            : stockTotal + signedTotal,
        attached: stockAttached + signedAttached,
      },
    };
  }

  // --- Item 65: vehicles added through the System ---------------------------------

  /**
   * The vehicles added through the System, newest first (`QUESTIONS.md` VEH-42).
   * Who recorded one is read from its earliest recording or declaring audit event,
   * for the page in one query. The owner's name and the chassis number go only to a
   * holder of `vehicle.read_restricted` over that vehicle, and whether it is
   * declared only to a holder of `vehicle.declare`. A telephone or an address is
   * never selected.
   */
  async addedVehicles(
    userId: string,
    query: AddedVehiclesQuery,
  ): Promise<AddedVehiclesResponse> {
    const assignments = await this.permissions.loadAssignments(userId);
    const scopes = this.scopesHolding(assignments, 'vehicle.read');

    const created: Prisma.DateTimeFilter = {};
    if (query.from) {
      created.gte = this.dayStart(query.from);
    }
    if (query.to) {
      created.lt = new Date(this.dayStart(query.to).getTime() + DAY_MS);
    }
    const plate = query.q
      ?.trim()
      .normalize('NFKD')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');

    const where: Prisma.VehicleWhereInput = {
      isLegacyImport: false,
      AND: [this.vehicleScope(scopes)],
      ...(Object.keys(created).length > 0 ? { createdAt: created } : {}),
      ...(plate ? { plateNumberNormalized: { contains: plate } } : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.vehicle.count({ where }),
      this.prisma.vehicle.findMany({
        where,
        select: {
          id: true,
          plateNumberDisplay: true,
          declaredAt: true,
          createdAt: true,
          chassisVinRestricted: true,
          vehicleCategory: { select: { label: true } },
          branch: { select: { id: true, name: true, path: true } },
          unit: { select: { id: true, name: true, path: true } },
          // The name only. The telephone and the address are never selected.
          owner: { select: { ownerName: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: query.limit,
        skip: query.offset,
      }),
    ]);

    const ids = rows.map((row) => row.id);
    const [stickers, events] = await Promise.all([
      this.prisma.sticker.findMany({
        where: { vehicleId: { in: ids }, attachedAt: { not: null } },
        orderBy: { attachedAt: 'desc' },
        select: { vehicleId: true, status: true },
      }),
      this.prisma.auditEvent.findMany({
        where: {
          subjectType: 'vehicle',
          subjectId: { in: ids },
          action: { in: ['vehicle.record', 'vehicle.declare'] },
          actorUserId: { not: null },
        },
        orderBy: { createdAt: 'asc' },
        select: { subjectId: true, actorUser: { select: { fullName: true } } },
      }),
    ]);
    const stickerOf = new Map<string, string>();
    for (const sticker of stickers) {
      if (sticker.vehicleId && !stickerOf.has(sticker.vehicleId)) {
        stickerOf.set(sticker.vehicleId, sticker.status);
      }
    }
    const recorderOf = new Map<string, string>();
    for (const event of events) {
      if (event.subjectId && !recorderOf.has(event.subjectId)) {
        recorderOf.set(event.subjectId, event.actorUser?.fullName ?? '');
      }
    }

    const vehicles = rows.map((row): AddedVehicle => {
      const organisation = row.unit ?? row.branch;
      if (!organisation) {
        // Every vehicle is created with a branch or a unit.
        throw new Error('A vehicle record carries no organisation.');
      }
      const may = (permission: string) =>
        decidePermission(assignments, {
          permission,
          subjectPath: organisation.path,
        }).allowed;
      const status = stickerOf.get(row.id);
      return {
        id: row.id,
        plate: row.plateNumberDisplay,
        category: row.vehicleCategory?.label ?? null,
        organisation: { id: organisation.id, name: organisation.name },
        recordedBy: recorderOf.get(row.id) || null,
        recordedAt: row.createdAt.toISOString(),
        sticker: { attached: status !== undefined, status: status ?? null },
        ...(may('vehicle.declare') ? { declared: row.declaredAt !== null } : {}),
        ...(may('vehicle.read_restricted')
          ? {
              owner: row.owner?.ownerName ?? null,
              chassis: row.chassisVinRestricted?.trim()
                ? row.chassisVinRestricted
                : null,
            }
          : {}),
      };
    });
    return { vehicles, total };
  }

  // --- Item 66: the onboarding report ----------------------------------------------

  /**
   * Counts per Lagos day and per officer of members registered, vehicles recorded,
   * vehicles declared, and stickers attached, by the officer's name, over the
   * records inside the caller's `report.read` scope. Only what the System
   * recorded: a member counts if a registration records who registered them, so
   * the imported members are not counted. Nothing new is collected.
   */
  async onboarding(
    userId: string,
    query: OnboardingReportQuery,
    now: Date = new Date(),
  ): Promise<OnboardingReport> {
    const range = readDayRange(query, now);
    if (!range.ok) {
      throw new BadRequestException();
    }
    const assignments = await this.permissions.loadAssignments(userId);
    const scopes = this.scopesHolding(assignments, 'report.read');
    const between = { gte: range.starts, lt: range.ends };

    const [applications, audit, stickers] = await Promise.all([
      this.prisma.membershipApplication.findMany({
        where: {
          createdByUserId: { not: null },
          createdAt: between,
          member: this.memberScope(scopes),
        },
        select: { createdByUserId: true, createdAt: true },
      }),
      this.prisma.auditEvent.findMany({
        where: {
          action: { in: ['vehicle.record', 'vehicle.declare'] },
          actorUserId: { not: null },
          createdAt: between,
          organisation: {
            OR: scopes.map((scope) => ({ path: { startsWith: scope } })),
          },
        },
        select: { action: true, actorUserId: true, createdAt: true },
      }),
      this.prisma.sticker.findMany({
        where: {
          attachedAt: between,
          attachedByUserId: { not: null },
          vehicle: this.vehicleScope(scopes),
        },
        select: { attachedByUserId: true, attachedAt: true },
      }),
    ]);

    const events: OnboardingEvent[] = [
      ...applications.map((row) => ({
        at: row.createdAt,
        officerId: row.createdByUserId!,
        kind: 'membersRegistered' as const,
      })),
      ...audit.map((row) => ({
        at: row.createdAt,
        officerId: row.actorUserId!,
        kind:
          row.action === 'vehicle.record'
            ? ('vehiclesRecorded' as const)
            : ('vehiclesDeclared' as const),
      })),
      ...stickers.map((row) => ({
        at: row.attachedAt!,
        officerId: row.attachedByUserId!,
        kind: 'stickersAttached' as const,
      })),
    ];

    const tallied = tallyOnboarding(events);
    const officerIds = [...new Set(tallied.map((row) => row.officerId))];
    const officers = await this.prisma.user.findMany({
      where: { id: { in: officerIds } },
      select: { id: true, fullName: true },
    });
    const nameOf = new Map(officers.map((officer) => [officer.id, officer.fullName]));

    const totals = {
      membersRegistered: 0,
      vehiclesRecorded: 0,
      vehiclesDeclared: 0,
      stickersAttached: 0,
    };
    const rows = tallied.map((row) => {
      totals.membersRegistered += row.membersRegistered;
      totals.vehiclesRecorded += row.vehiclesRecorded;
      totals.vehiclesDeclared += row.vehiclesDeclared;
      totals.stickersAttached += row.stickersAttached;
      return {
        day: row.day,
        officer: { id: row.officerId, name: nameOf.get(row.officerId) ?? 'Unknown' },
        membersRegistered: row.membersRegistered,
        vehiclesRecorded: row.vehiclesRecorded,
        vehiclesDeclared: row.vehiclesDeclared,
        stickersAttached: row.stickersAttached,
      };
    });
    return { from: range.from, to: range.to, rows, totals };
  }

  // --- Item 67: the counts on Home -----------------------------------------------------

  async memberCounts(userId: string, now: Date = new Date()): Promise<MemberCounts> {
    const assignments = await this.permissions.loadAssignments(userId);
    const scopes = this.scopesHolding(assignments, 'member.read');
    const member = this.memberScope(scopes);
    const today = lagosDayBegins(lagosDay(now));
    const week = new Date(today.getTime() - 6 * DAY_MS);
    const registeredSince = (since: Date) =>
      this.prisma.membershipApplication.count({
        where: { createdByUserId: { not: null }, createdAt: { gte: since }, member },
      });

    const [active, suspended, registeredToday, registeredLastSevenDays] =
      await Promise.all([
        this.prisma.member.count({ where: { status: 'ACTIVE', ...member } }),
        this.prisma.member.count({ where: { status: 'SUSPENDED', ...member } }),
        registeredSince(today),
        registeredSince(week),
      ]);
    return { active, suspended, registeredToday, registeredLastSevenDays };
  }

  async vehicleCounts(userId: string, now: Date = new Date()): Promise<VehicleCounts> {
    const assignments = await this.permissions.loadAssignments(userId);
    const scoped = this.vehicleScope(this.scopesHolding(assignments, 'vehicle.read'));
    const today = lagosDayBegins(lagosDay(now));

    const [total, addedThroughSystem, addedToday, withoutSticker] = await Promise.all([
      this.prisma.vehicle.count({ where: scoped }),
      this.prisma.vehicle.count({ where: { ...scoped, isLegacyImport: false } }),
      this.prisma.vehicle.count({
        where: { ...scoped, isLegacyImport: false, createdAt: { gte: today } },
      }),
      // No status is left out: the count must not say which vehicles are retired (VEH-28).
      this.prisma.vehicle.count({
        where: { ...scoped, stickers: { none: { attachedAt: { not: null } } } },
      }),
    ]);

    // The declaration status is for a holder of `vehicle.declare` alone, and only
    // over the vehicles that holder may see it for (VEH-28, VEH-43).
    const declareScopes = this.scopesHolding(assignments, 'vehicle.declare');
    if (declareScopes.length === 0) {
      return { total, addedThroughSystem, addedToday, withoutSticker };
    }
    const declarable = this.vehicleScope(declareScopes);
    const [notDeclared, declared] = await Promise.all([
      this.prisma.vehicle.count({
        where: {
          ...declarable,
          declaredAt: null,
          status: { notIn: ['RETIRED', 'ARCHIVED'] },
        },
      }),
      this.prisma.vehicle.count({
        where: { ...declarable, declaredAt: { not: null } },
      }),
    ]);
    return {
      total,
      addedThroughSystem,
      addedToday,
      withoutSticker,
      declaration: { notDeclared, declared },
    };
  }

  /**
   * The caller's own work, today and over the last seven Lagos days (GOV-25, the field
   * enumerator's dashboard): members they registered, vehicles they recorded, stickers they
   * attached. Only their own actions are counted, so it reads no one else's record and
   * needs no scope. An imported member has no registering officer, so is never counted.
   */
  async ownWork(userId: string, now: Date = new Date()): Promise<OwnWork> {
    const today = lagosDayBegins(lagosDay(now));
    const week = new Date(today.getTime() - 6 * DAY_MS);
    const since = async (from: Date) => {
      const [membersRegistered, vehiclesRecorded, stickersAttached] = await Promise.all([
        this.prisma.membershipApplication.count({
          where: { createdByUserId: userId, createdAt: { gte: from } },
        }),
        this.prisma.auditEvent.count({
          where: { action: 'vehicle.record', actorUserId: userId, createdAt: { gte: from } },
        }),
        this.prisma.sticker.count({
          where: { attachedByUserId: userId, attachedAt: { gte: from } },
        }),
      ]);
      return { membersRegistered, vehiclesRecorded, stickersAttached };
    };
    const [todayCounts, weekCounts] = await Promise.all([since(today), since(week)]);
    return { today: todayCounts, lastSevenDays: weekCounts };
  }

  // --- Scope ---------------------------------------------------------------------------

  private dayStart(day: string): Date {
    const start = lagosDayBegins(day);
    if (Number.isNaN(start.getTime())) {
      throw new BadRequestException();
    }
    return start;
  }

  /** The outermost organisation paths in which the caller holds the permission. */
  private scopesHolding(
    assignments: PermissionAssignments,
    permission: string,
  ): string[] {
    return outermostScopes(
      listEffectivePermissions(assignments)
        .filter((entry) => entry.permission === permission)
        .map((entry) => entry.scopePath),
    );
  }

  /** A vehicle is judged by its unit's path, or its branch's when it has no unit. */
  private vehicleScope(scopes: readonly string[]): Prisma.VehicleWhereInput {
    return {
      OR: scopes.flatMap((scope) => [
        { unitId: { not: null }, unit: { path: { startsWith: scope } } },
        { unitId: null, branch: { path: { startsWith: scope } } },
      ]),
    };
  }

  private memberScope(scopes: readonly string[]): Prisma.MemberWhereInput {
    return {
      organisation: { OR: scopes.map((scope) => ({ path: { startsWith: scope } })) },
    };
  }
}
