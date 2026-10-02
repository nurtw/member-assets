import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  FeeTypeSummary,
  SetFeeTypePriceInput,
  UpdateFeeTypeInput,
} from '@nurtw/contracts';
import { resolveFeeAmountKobo } from '@nurtw/domain';
import type { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LAUNCH_FEE_TYPES } from './launch-fee-types.js';

export { LAUNCH_FEE_TYPES };

const PRICE_SELECT = {
  amountKobo: true,
  routeType: { select: { id: true, code: true, label: true } },
} as const;

/**
 * Fee types are data, not code (Requirement 27.1). This service is the only
 * reader; a route or a background job asks it for the current amount rather
 * than holding one of its own, so a settings change reaches every caller on
 * its next read — the same "read on every call" discipline as
 * `SettingsService`.
 *
 * Every change is audited with a mandatory reason (Requirement 27.2), before
 * and after. Union-wide, like master data: fee types belong to no branch, so
 * the guard's `fee_type.manage` check is the whole check.
 */
@Injectable()
export class FeeTypeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async seedLaunchFeeTypes(): Promise<void> {
    for (const feeType of LAUNCH_FEE_TYPES) {
      await this.prisma.feeType.upsert({
        where: { code: feeType.code },
        create: feeType,
        update: {},
      });
    }
  }

  async findByCode(code: string) {
    const feeType = await this.prisma.feeType.findUnique({
      where: { code },
      include: { prices: { select: { routeTypeId: true, amountKobo: true } } },
    });
    if (!feeType || !feeType.active) {
      throw new NotFoundException(`No active fee type "${code}".`);
    }
    return feeType;
  }

  /**
   * The due a fee type charges this subject (PRD Requirement 27.1, PAY-14).
   * A vehicle-charged fee uses the vehicle's route-type amount where one is
   * set; everything else — a member-charged fee, a route type not priced
   * separately, a legacy vehicle with no route type — uses the default.
   *
   * The vehicle is read only when the fee type is priced by route at all;
   * a flat fee (a sticker) has nothing to look up.
   */
  async amountFor(
    feeType: Awaited<ReturnType<FeeTypeService['findByCode']>>,
    subject: { type: 'member' | 'vehicle'; id: string },
  ): Promise<number> {
    let routeTypeId: string | null = null;
    if (
      feeType.chargedAgainst === 'VEHICLE' &&
      subject.type === 'vehicle' &&
      feeType.prices.length > 0
    ) {
      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: subject.id },
        select: { routeTypeId: true },
      });
      if (!vehicle) {
        throw new NotFoundException('No such vehicle.');
      }
      routeTypeId = vehicle.routeTypeId;
    }
    return resolveFeeAmountKobo({
      defaultAmountKobo: feeType.amountKobo,
      prices: feeType.prices,
      routeTypeId,
    });
  }

  async list(): Promise<FeeTypeSummary[]> {
    const rows = await this.prisma.feeType.findMany({
      orderBy: { code: 'asc' },
      include: {
        prices: {
          select: PRICE_SELECT,
          orderBy: { routeType: { sortOrder: 'asc' } },
        },
      },
    });
    return rows.map((row) => this.toSummary(row));
  }

  async update(
    actor: ActorContext,
    code: string,
    input: UpdateFeeTypeInput,
  ): Promise<FeeTypeSummary> {
    const before = await this.prisma.feeType.findUnique({ where: { code } });
    if (!before) {
      throw new NotFoundException();
    }

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.feeType.update({
        where: { code },
        data: {
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.amountKobo !== undefined
            ? { amountKobo: input.amountKobo }
            : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
        include: {
          prices: {
            select: PRICE_SELECT,
            orderBy: { routeType: { sortOrder: 'asc' } },
          },
        },
      });

      if (
        input.amountKobo !== undefined &&
        input.amountKobo !== before.amountKobo
      ) {
        await this.recordAmountChange(tx, {
          feeTypeId: before.id,
          routeTypeId: null,
          previousKobo: before.amountKobo,
          amountKobo: input.amountKobo,
          actorUserId: actor.userId,
        });
      }

      await this.audit.record(
        {
          action: 'fee_type.update',
          subjectType: 'fee_type',
          subjectId: before.id,
          actorUserId: actor.userId,
          before: {
            code,
            label: before.label,
            amountKobo: before.amountKobo,
            active: before.active,
          },
          after: {
            code,
            label: row.label,
            amountKobo: row.amountKobo,
            active: row.active,
          },
          reason: input.reason,
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return this.toSummary(row);
    });
  }

  /** Sets (creating or replacing) a fee type's amount for one route type. */
  async setPrice(
    actor: ActorContext,
    code: string,
    routeTypeCode: string,
    input: SetFeeTypePriceInput,
  ): Promise<FeeTypeSummary> {
    const [feeType, routeType] = await Promise.all([
      this.prisma.feeType.findUnique({ where: { code } }),
      this.prisma.routeType.findUnique({ where: { code: routeTypeCode } }),
    ]);
    if (!feeType || !routeType) {
      throw new NotFoundException();
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.feeTypePrice.findUnique({
        where: {
          feeTypeId_routeTypeId: {
            feeTypeId: feeType.id,
            routeTypeId: routeType.id,
          },
        },
      });

      await tx.feeTypePrice.upsert({
        where: {
          feeTypeId_routeTypeId: {
            feeTypeId: feeType.id,
            routeTypeId: routeType.id,
          },
        },
        create: {
          feeTypeId: feeType.id,
          routeTypeId: routeType.id,
          amountKobo: input.amountKobo,
        },
        update: { amountKobo: input.amountKobo },
      });

      if (existing?.amountKobo !== input.amountKobo) {
        await this.recordAmountChange(tx, {
          feeTypeId: feeType.id,
          routeTypeId: routeType.id,
          // No baseline when the route type had no amount of its own: until
          // now the default applied, and `resolveFeeAmountAtKobo` reads the
          // absence of an earlier row as exactly that.
          previousKobo: existing?.amountKobo ?? null,
          amountKobo: input.amountKobo,
          actorUserId: actor.userId,
        });
      }

      await this.audit.record(
        {
          action: 'fee_type.price_set',
          subjectType: 'fee_type',
          subjectId: feeType.id,
          actorUserId: actor.userId,
          before: existing
            ? { routeTypeCode, amountKobo: existing.amountKobo }
            : { routeTypeCode, amountKobo: null },
          after: { routeTypeCode, amountKobo: input.amountKobo },
          reason: input.reason,
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      const row = await tx.feeType.findUniqueOrThrow({
        where: { id: feeType.id },
        include: {
          prices: {
            select: PRICE_SELECT,
            orderBy: { routeType: { sortOrder: 'asc' } },
          },
        },
      });
      return this.toSummary(row);
    });
  }

  /**
   * Appends to `fee_amount_history` (item 22), in the caller's transaction so
   * a change and its history row commit together or not at all.
   *
   * The first change to a key also writes the amount it replaced, effective
   * from the epoch. That baseline is what lets a past month be priced at the
   * amount in force when it fell due, however many changes follow.
   */
  private async recordAmountChange(
    tx: Prisma.TransactionClient,
    change: {
      feeTypeId: string;
      routeTypeId: string | null;
      previousKobo: number | null;
      amountKobo: number;
      actorUserId: string;
    },
  ): Promise<void> {
    const key = { feeTypeId: change.feeTypeId, routeTypeId: change.routeTypeId };
    if (
      change.previousKobo !== null &&
      (await tx.feeAmountHistory.count({ where: key })) === 0
    ) {
      await tx.feeAmountHistory.create({
        data: { ...key, amountKobo: change.previousKobo, effectiveFrom: new Date(0) },
      });
    }
    await tx.feeAmountHistory.create({
      data: {
        ...key,
        amountKobo: change.amountKobo,
        effectiveFrom: new Date(),
        changedByUserId: change.actorUserId,
      },
    });
  }

  private toSummary(row: {
    code: string;
    label: string;
    amountKobo: number;
    recurrence: string;
    chargedAgainst: string;
    settlement: string;
    active: boolean;
    isPlaceholder: boolean;
    prices: {
      amountKobo: number;
      routeType: { id: string; code: string; label: string };
    }[];
  }): FeeTypeSummary {
    return {
      code: row.code,
      label: row.label,
      amountKobo: row.amountKobo,
      recurrence: row.recurrence,
      chargedAgainst: row.chargedAgainst,
      settlement: row.settlement,
      active: row.active,
      isPlaceholder: row.isPlaceholder,
      prices: row.prices.map((price) => ({
        routeType: price.routeType,
        amountKobo: price.amountKobo,
      })),
    };
  }
}
