import { Injectable } from '@nestjs/common';
import {
  DEFAULT_AGGREGATE_SUPPRESSION_FLOOR,
  type AggregateFiltersApplied,
  type AggregateVehicleQuery,
  type AggregateVehicleResponse,
  type OrganisationMetadataResponse,
} from '@nurtw/contracts';
import {
  AGGREGATE_LIMITATION,
  AGGREGATE_STATEMENT,
  SUPPRESSED,
  filteredTotal,
  hasPeriodBegun,
  parseReportingPeriod,
  periodCountedAt,
} from '@nurtw/domain';
import type { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service.js';
import type {
  AuthenticatedApiClient,
  ExternalOutcome,
} from '../auth/require-scope.decorator.js';
import { ValidationException } from '../common/zod-validation.pipe.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AGGREGATE_ROUNDING_BASE,
  AGGREGATE_SUPPRESSION_FLOOR,
  SettingsService,
} from '../settings/settings.service.js';

/** The rounding base when the setting is absent or unreadable. */
const DEFAULT_ROUNDING_BASE = 10;

export interface AggregateRequestMeta {
  requestId: string;
  ipAddress: string | undefined;
}

export interface AggregateResult<T> {
  response: T;
  outcome: ExternalOutcome;
}

/** The filters, resolved to what the count reads. */
interface ResolvedFilters {
  zonePath?: string;
  branchId?: string;
  categoryId?: string;
}

/**
 * Vehicle totals for outside organisations (PRD §13 — item 14).
 *
 * - **The count** is vehicles declared and onboarded as at an instant, and
 *   not retired by then (Requirement 13.5, `isCountedAt` in
 *   `@nurtw/domain`, which `countAt` restates as a query). A legacy vehicle
 *   on record never counts until it is both (acceptance criterion 14).
 * - **The query always runs.** A small total is suppressed after it is
 *   computed, so a suppressed answer takes the same path, time, and shape as
 *   any other (Requirement 13.4).
 * - **A filtered total is rounded**, the grand total is not (the owner's
 *   direction of 4 October 2026). The floor and the base are settings.
 *
 * Read-only apart from its audit event, like verification: it reads vehicle
 * and organisation rows and writes none.
 */
@Injectable()
export class AggregateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  /** `aggregate:vehicles:total` — the unfiltered total, now, exact. */
  async grandTotal(
    client: AuthenticatedApiClient,
    meta: AggregateRequestMeta,
    now: Date = new Date(),
  ): Promise<AggregateResult<AggregateVehicleResponse>> {
    const count = await this.countAt(now, {});
    await this.record('aggregate.external.total', client, meta, {
      filters: {},
      countedAt: now.toISOString(),
      count,
      answered: count,
    });
    return {
      response: this.answer({}, count, undefined, now, now, meta),
      outcome: { resultClass: 'TOTAL', identifierScheme: null },
    };
  }

  /** `aggregate:vehicles:read` — a total under the approved filters. */
  async filtered(
    client: AuthenticatedApiClient,
    query: AggregateVehicleQuery,
    meta: AggregateRequestMeta,
    now: Date = new Date(),
  ): Promise<AggregateResult<AggregateVehicleResponse>> {
    const period = query.period ? parseReportingPeriod(query.period) : null;
    if (period && !hasPeriodBegun(period, now)) {
      throw new ValidationException([
        { field: 'period', message: 'That period has not begun.' },
      ]);
    }
    const countedAt = period ? periodCountedAt(period, now) : now;
    const filters = await this.resolve(query);

    const [count, floor, base] = await Promise.all([
      this.countAt(countedAt, filters),
      this.settings.getPositiveInteger(
        AGGREGATE_SUPPRESSION_FLOOR,
        DEFAULT_AGGREGATE_SUPPRESSION_FLOOR,
      ),
      this.settings.getPositiveInteger(
        AGGREGATE_ROUNDING_BASE,
        DEFAULT_ROUNDING_BASE,
      ),
    ]);
    const answered = filteredTotal(count, floor, base);

    const applied: AggregateFiltersApplied = {
      ...(query.zone_id ? { zone_id: query.zone_id } : {}),
      ...(query.branch_id ? { branch_id: query.branch_id } : {}),
      ...(query.vehicle_category
        ? { vehicle_category: query.vehicle_category }
        : {}),
      ...(query.period ? { period: query.period } : {}),
    };
    await this.record('aggregate.external.vehicles', client, meta, {
      filters: { ...applied },
      countedAt: countedAt.toISOString(),
      count,
      answered,
      floor,
      roundedToNearest: base,
    });
    return {
      response: this.answer(applied, answered, base, countedAt, now, meta),
      outcome: {
        resultClass: answered === SUPPRESSED ? 'SUPPRESSED' : 'TOTAL',
        identifierScheme: null,
      },
    };
  }

  /**
   * `organization:metadata:read` — the zones, branches, and vehicle
   * categories a filter may name. Active ones only. The Union's structure,
   * never a member or a vehicle.
   */
  async metadata(
    meta: AggregateRequestMeta,
    now: Date = new Date(),
  ): Promise<AggregateResult<OrganisationMetadataResponse>> {
    const [zones, branches, categories] = await Promise.all([
      this.prisma.organisation.findMany({
        where: { level: 'ZONE', isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.organisation.findMany({
        where: { level: 'BRANCH', isActive: true },
        select: { id: true, name: true, parentId: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.vehicleCategory.findMany({
        where: { isActive: true },
        select: { code: true, label: true },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      }),
    ]);
    return {
      response: {
        request_id: meta.requestId,
        zones,
        branches: branches.map((branch) => ({
          id: branch.id,
          name: branch.name,
          zone_id: branch.parentId,
        })),
        vehicle_categories: categories,
        verified_at: now.toISOString(),
      },
      outcome: { resultClass: 'METADATA', identifierScheme: null },
    };
  }

  /**
   * The count. Restates `isCountedAt` as a query: declared by then, a
   * sticker attached by then, and declared now or retired after then.
   */
  private countAt(at: Date, filters: ResolvedFilters): Promise<number> {
    const where: Prisma.VehicleWhereInput = {
      declaredAt: { lte: at },
      stickers: { some: { attachedAt: { lte: at } } },
      OR: [{ status: 'ACTIVE' }, { status: 'RETIRED', retiredAt: { gt: at } }],
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
      ...(filters.zonePath
        ? { branch: { path: { startsWith: filters.zonePath } } }
        : {}),
      ...(filters.categoryId ? { vehicleCategoryId: filters.categoryId } : {}),
    };
    return this.prisma.vehicle.count({ where });
  }

  /**
   * Names to rows. A zone, branch, or category that is not active is refused
   * as a request error: the Union's structure is published through the
   * metadata route, so this tells the caller nothing about the record set.
   */
  private async resolve(
    query: AggregateVehicleQuery,
  ): Promise<ResolvedFilters> {
    const resolved: ResolvedFilters = {};
    if (query.zone_id) {
      const zone = await this.prisma.organisation.findFirst({
        where: { id: query.zone_id, level: 'ZONE', isActive: true },
        select: { path: true },
      });
      if (!zone) {
        throw new ValidationException([
          { field: 'zone_id', message: 'That is not a zone in the metadata.' },
        ]);
      }
      resolved.zonePath = zone.path;
    }
    if (query.branch_id) {
      const branch = await this.prisma.organisation.findFirst({
        where: { id: query.branch_id, level: 'BRANCH', isActive: true },
        select: { id: true },
      });
      if (!branch) {
        throw new ValidationException([
          {
            field: 'branch_id',
            message: 'That is not a branch in the metadata.',
          },
        ]);
      }
      resolved.branchId = branch.id;
    }
    if (query.vehicle_category) {
      const category = await this.prisma.vehicleCategory.findFirst({
        where: { code: query.vehicle_category, isActive: true },
        select: { id: true },
      });
      if (!category) {
        throw new ValidationException([
          {
            field: 'vehicle_category',
            message: 'That is not a vehicle category in the metadata.',
          },
        ]);
      }
      resolved.categoryId = category.id;
    }
    return resolved;
  }

  /**
   * Who asked and what they were told, with the exact count beside the
   * answer, so the Union can reconcile any total it gave out.
   */
  private record(
    action: string,
    client: AuthenticatedApiClient,
    meta: AggregateRequestMeta,
    after: Record<string, Prisma.InputJsonValue | null>,
  ): Promise<void> {
    return this.audit.record({
      action,
      subjectType: 'aggregate',
      requestId: meta.requestId,
      ipAddress: meta.ipAddress,
      after: {
        channel: 'EXTERNAL',
        clientId: client.clientId,
        tokenId: client.tokenId,
        ...after,
      },
    });
  }

  private answer(
    filters: AggregateFiltersApplied,
    count: number | typeof SUPPRESSED,
    roundedTo: number | undefined,
    countedAt: Date,
    now: Date,
    meta: AggregateRequestMeta,
  ): AggregateVehicleResponse {
    return {
      request_id: meta.requestId,
      result: 'AGGREGATE_ONLY',
      filters_applied: filters,
      totals: { vehicle_count: count },
      ...(roundedTo !== undefined ? { rounded_to_nearest: roundedTo } : {}),
      statement: AGGREGATE_STATEMENT,
      limitation: AGGREGATE_LIMITATION,
      data_as_of: countedAt.toISOString(),
      verified_at: now.toISOString(),
    };
  }
}
