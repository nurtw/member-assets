import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  AddedVehicle,
  AddedVehiclesQuery,
  AddedVehiclesResponse,
  MemberCounts,
  OnboardedVehicles,
  OnboardingReport,
  OnboardingReportQuery,
  OwnWork,
  OwnWorkQuery,
  StickerOriginCounts,
  VehicleCounts,
} from '@nurtw/contracts';
import {
  countOnboarded,
  decidePermission,
  firstAttachments,
  lagosDay,
  lagosDayBegins,
  listEffectivePermissions,
  outermostScopes,
  readDayRange,
  tallyOnboarding,
  type OnboardingEvent,
  type PermissionAssignments,
  type StickerAttachment,
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
        ...(may('vehicle.declare')
          ? { declared: row.declaredAt !== null }
          : {}),
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
   * Counts per Lagos day and per officer of vehicles onboarded (legacy and new), members
   * registered, and vehicles recorded, by the officer's name, over the records inside the
   * caller's `report.read` scope (the owner's direction of 18 November 2026). A vehicle is
   * onboarded on the day its first sticker is attached, by the officer who attached it.
   * Only what the System recorded: a member counts if a registration records who
   * registered them, so the imported members are not counted. Nothing new is collected.
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

    const [applications, recorded, attachments] = await Promise.all([
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
          action: 'vehicle.record',
          actorUserId: { not: null },
          createdAt: between,
          organisation: {
            OR: scopes.map((scope) => ({ path: { startsWith: scope } })),
          },
        },
        select: { actorUserId: true, createdAt: true },
      }),
      // Every attachment of a vehicle that had one in the range, so that a vehicle
      // first onboarded before the range is not counted again for a replacement.
      this.attachments({
        AND: [
          this.vehicleScope(scopes),
          { stickers: { some: { attachedAt: between } } },
        ],
      }),
    ]);
    const onboardings = firstAttachments(attachments).filter(
      (row) => row.at >= range.starts && row.at < range.ends,
    );

    const events: OnboardingEvent[] = [
      ...applications.map((row) => ({
        at: row.createdAt,
        officerId: row.createdByUserId!,
        kind: 'membersRegistered' as const,
      })),
      ...recorded.map((row) => ({
        at: row.createdAt,
        officerId: row.actorUserId!,
        kind: 'vehiclesRecorded' as const,
      })),
      ...onboardings.flatMap((row): OnboardingEvent[] =>
        row.officerId === null
          ? []
          : [
              {
                at: row.at,
                officerId: row.officerId,
                kind: row.imported
                  ? 'importedVehiclesOnboarded'
                  : 'addedVehiclesOnboarded',
              },
            ],
      ),
    ];

    const tallied = tallyOnboarding(events);
    const officerIds = [...new Set(tallied.map((row) => row.officerId))];
    const officers = await this.prisma.user.findMany({
      where: { id: { in: officerIds } },
      select: { id: true, fullName: true },
    });
    const nameOf = new Map(
      officers.map((officer) => [officer.id, officer.fullName]),
    );

    const onboarded = (imported: number, added: number): OnboardedVehicles => ({
      total: imported + added,
      imported,
      added,
    });
    let membersRegistered = 0;
    let vehiclesRecorded = 0;
    let imported = 0;
    let added = 0;
    const rows = tallied.map((row) => {
      membersRegistered += row.membersRegistered;
      vehiclesRecorded += row.vehiclesRecorded;
      imported += row.importedVehiclesOnboarded;
      added += row.addedVehiclesOnboarded;
      return {
        day: row.day,
        officer: {
          id: row.officerId,
          name: nameOf.get(row.officerId) ?? 'Unknown',
        },
        vehiclesOnboarded: onboarded(
          row.importedVehiclesOnboarded,
          row.addedVehiclesOnboarded,
        ),
        membersRegistered: row.membersRegistered,
        vehiclesRecorded: row.vehiclesRecorded,
      };
    });
    return {
      from: range.from,
      to: range.to,
      rows,
      totals: {
        vehiclesOnboarded: onboarded(imported, added),
        membersRegistered,
        vehiclesRecorded,
      },
    };
  }

  // --- Item 67: the counts on Home -----------------------------------------------------

  async memberCounts(
    userId: string,
    now: Date = new Date(),
  ): Promise<MemberCounts> {
    const assignments = await this.permissions.loadAssignments(userId);
    const scopes = this.scopesHolding(assignments, 'member.read');
    const member = this.memberScope(scopes);
    const today = lagosDayBegins(lagosDay(now));
    const registeredSince = (since?: Date) =>
      this.prisma.membershipApplication.count({
        where: {
          createdByUserId: { not: null },
          ...(since ? { createdAt: { gte: since } } : {}),
          member,
        },
      });

    const [registered, registeredToday, active, suspended] = await Promise.all([
      registeredSince(),
      registeredSince(today),
      this.prisma.member.count({ where: { status: 'ACTIVE', ...member } }),
      this.prisma.member.count({ where: { status: 'SUSPENDED', ...member } }),
    ]);
    return { registered, registeredToday, active, suspended };
  }

  /**
   * The vehicles onboarded in scope, led by the total (the owner's direction of
   * 18 November 2026). No status is left out of any figure here but the declaration
   * backlog, so a count cannot say which vehicle is retired (VEH-28).
   */
  async vehicleCounts(
    userId: string,
    now: Date = new Date(),
  ): Promise<VehicleCounts> {
    const assignments = await this.permissions.loadAssignments(userId);
    const scoped = this.vehicleScope(
      this.scopesHolding(assignments, 'vehicle.read'),
    );
    const today = lagosDayBegins(lagosDay(now));
    const onboarded: Prisma.VehicleWhereInput = {
      ...scoped,
      stickers: { some: { attachedAt: { not: null } } },
    };
    // The first sticker today: one attached today, and none before.
    const onboardedToday: Prisma.VehicleWhereInput = {
      ...scoped,
      stickers: {
        some: { attachedAt: { gte: today } },
        none: { attachedAt: { lt: today } },
      },
    };
    const split = async (
      where: Prisma.VehicleWhereInput,
    ): Promise<OnboardedVehicles> => {
      const [imported, added] = await Promise.all([
        this.prisma.vehicle.count({
          where: { ...where, isLegacyImport: true },
        }),
        this.prisma.vehicle.count({
          where: { ...where, isLegacyImport: false },
        }),
      ]);
      return { total: imported + added, imported, added };
    };

    const [all, todays, onboardedWithoutMember, withoutSticker] =
      await Promise.all([
        split(onboarded),
        split(onboardedToday),
        this.prisma.vehicle.count({
          where: { ...onboarded, declaredByMemberId: null },
        }),
        this.prisma.vehicle.count({
          where: {
            ...scoped,
            stickers: { none: { attachedAt: { not: null } } },
          },
        }),
      ]);
    const counts: VehicleCounts = {
      onboarded: all,
      onboardedToday: todays,
      onboardedWithoutMember,
      withoutSticker,
    };

    // The declaration status is for a holder of `vehicle.declare` alone, and only
    // over the vehicles that holder may see it for (VEH-28, VEH-43).
    const declareScopes = this.scopesHolding(assignments, 'vehicle.declare');
    if (declareScopes.length === 0) {
      return counts;
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
    return { ...counts, declaration: { notDeclared, declared } };
  }

  /**
   * The caller's own work (GOV-25; the owner's direction of 18 November 2026, the field
   * enumerator's dashboard): vehicles they onboarded and members they registered, in all
   * since their account was made and on one Lagos day. A vehicle is theirs when they
   * attached its first sticker, legacy or new. Only their own actions are counted, so it
   * reads no one else's record and needs no scope. An imported member has no registering
   * officer, so is never counted. Nothing about declaring is counted or said.
   */
  async ownWork(
    userId: string,
    query: OwnWorkQuery,
    now: Date = new Date(),
  ): Promise<OwnWork> {
    const day = query.day ?? lagosDay(now);
    const starts = lagosDayBegins(day);
    const ends = new Date(starts.getTime() + DAY_MS);

    const [user, attachments, membersTotal, membersOnDay, recorded] =
      await Promise.all([
        this.prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: { createdAt: true },
        }),
        this.attachments({ stickers: { some: { attachedByUserId: userId } } }),
        this.prisma.membershipApplication.count({
          where: { createdByUserId: userId },
        }),
        this.prisma.membershipApplication.count({
          where: {
            createdByUserId: userId,
            createdAt: { gte: starts, lt: ends },
          },
        }),
        this.prisma.auditEvent.findMany({
          where: {
            action: 'vehicle.record',
            actorUserId: userId,
            subjectType: 'vehicle',
            subjectId: { not: null },
          },
          select: { subjectId: true },
        }),
      ]);

    const mine = firstAttachments(attachments).filter(
      (row) => row.officerId === userId,
    );
    const onDay = mine.filter((row) => row.at >= starts && row.at < ends);
    const recordedIds = [...new Set(recorded.map((row) => row.subjectId!))];
    const awaitingSticker =
      recordedIds.length === 0
        ? 0
        : await this.prisma.vehicle.count({
            where: {
              id: { in: recordedIds },
              stickers: { none: { attachedAt: { not: null } } },
            },
          });

    return {
      since: lagosDay(user.createdAt),
      total: {
        vehiclesOnboarded: countOnboarded(mine),
        membersRegistered: membersTotal,
      },
      day,
      onDay: {
        vehiclesOnboarded: countOnboarded(onDay),
        membersRegistered: membersOnDay,
      },
      awaitingSticker,
    };
  }

  /** Every sticker attachment of the vehicles that match, for `firstAttachments`. */
  private async attachments(
    vehicle: Prisma.VehicleWhereInput,
  ): Promise<StickerAttachment[]> {
    const rows = await this.prisma.sticker.findMany({
      where: { attachedAt: { not: null }, vehicleId: { not: null }, vehicle },
      select: {
        vehicleId: true,
        attachedAt: true,
        attachedByUserId: true,
        vehicle: { select: { isLegacyImport: true } },
      },
    });
    return rows.map((row) => ({
      vehicleId: row.vehicleId!,
      at: row.attachedAt!,
      officerId: row.attachedByUserId,
      imported: row.vehicle?.isLegacyImport ?? false,
    }));
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
      organisation: {
        OR: scopes.map((scope) => ({ path: { startsWith: scope } })),
      },
    };
  }
}
