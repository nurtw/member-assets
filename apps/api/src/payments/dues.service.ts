import { Injectable, NotFoundException } from '@nestjs/common';
import type { MemberDues, VehicleDues } from '@nurtw/contracts';
import {
  levySchedule,
  membershipCover,
  resolveFeeAmountAtKobo,
  routeTypeInForce,
  type OutstandingDue,
} from '@nurtw/domain';

import { PermissionService } from '../auth/permission.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  DUES_GO_LIVE_DATE,
  SettingsService,
} from '../settings/settings.service.js';

const READ_VEHICLE = 'vehicle.read';
const READ_MEMBER = 'member.read';

/** PRD Requirement 27.13 names these two dues; the launch fee types carry them. */
export const LEVY = 'LEVY';
export const MEMBERSHIP = 'MEMBERSHIP';

/** Everything one member owes now (item 23), and the figures it came from. */
export interface MemberOutstanding {
  /** Every due period not fully paid, membership and levy together. */
  dues: OutstandingDue[];
  membership: MemberDues;
  vehicles: { vehicleId: string; plate: string; dues: VehicleDues }[];
}

/** `2026-11-10`, the Lagos calendar date of an instant. */
function lagosDate(instant: Date): string {
  return new Date(instant.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * What is owed (PRD Requirements 27.8, 27.13 — item 22).
 *
 * Nothing here is stored. A levy month is paid because the ledger holds enough
 * credit for it, and a membership is paid because a confirmed payment covers
 * today; there is no flag to set, so there is none to overwrite (Requirement
 * 27.9). The rules themselves are pure functions in `@nurtw/domain`; this
 * service only gathers what they need.
 *
 * **Dues status is internal** (Requirement 27.8). Nothing in the verification
 * API, the public page, or a disclosure profile may call this service's
 * results into a response. Item 10 shows them *beside* an internal scan result,
 * through `vehicleDues` and `memberDues`, after its own authorisation.
 */
@Injectable()
export class DuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly settings: SettingsService,
  ) {}

  /** `GET /vehicles/:id/dues`. Out of scope answers 404, like no such vehicle. */
  async forVehicle(userId: string, vehicleId: string): Promise<VehicleDues> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        branch: { select: { path: true } },
        unit: { select: { path: true } },
      },
    });
    const path = vehicle?.unit?.path ?? vehicle?.branch?.path;
    if (!path || !(await this.permissions.can(userId, READ_VEHICLE, path))) {
      throw new NotFoundException();
    }
    return this.vehicleDues(vehicleId);
  }

  /** `GET /members/:id/dues`. Out of scope answers 404, like no such member. */
  async forMember(userId: string, memberId: string): Promise<MemberDues> {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: { organisation: { select: { path: true } } },
    });
    if (
      !member ||
      !(await this.permissions.can(userId, READ_MEMBER, member.organisation.path))
    ) {
      throw new NotFoundException();
    }
    return this.memberDues(memberId);
  }

  /**
   * The levy on one vehicle. **Not authorised here**: the caller has already
   * established that the user may see this vehicle.
   */
  async vehicleDues(vehicleId: string, now = new Date()): Promise<VehicleDues> {
    const dues = (await this.vehiclesDues([vehicleId], now)).get(vehicleId);
    if (!dues) {
      throw new NotFoundException();
    }
    return dues;
  }

  /**
   * The levy on several vehicles, in a fixed number of queries however many
   * there are. A member's outstanding dues, and the sweep that runs over every
   * member holding credit, used to ask four questions per vehicle. A vehicle
   * that does not exist is left out of the answer. **Not authorised here**, as
   * above.
   */
  async vehiclesDues(
    vehicleIds: readonly string[],
    now = new Date(),
  ): Promise<Map<string, VehicleDues>> {
    const ids = [...new Set(vehicleIds)];
    const result = new Map<string, VehicleDues>();
    if (ids.length === 0) {
      return result;
    }

    const [vehicles, feeType, attachments, credits] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          routeTypeId: true,
          retiredAt: true,
          routeTypeChanges: {
            select: {
              routeTypeId: true,
              previousRouteTypeId: true,
              changedAt: true,
            },
          },
        },
      }),
      this.feeType(LEVY),
      // Onboarded when a sticker was first attached (Decision 6.5). A later
      // replacement does not restart the levy.
      this.prisma.sticker.groupBy({
        by: ['vehicleId'],
        where: { vehicleId: { in: ids }, attachedAt: { not: null } },
        _min: { attachedAt: true },
      }),
      this.ledgerCreditsKobo(LEVY, 'vehicle', ids),
    ]);
    const firstAttachment = new Map(
      attachments.map((row) => [row.vehicleId, row._min.attachedAt]),
    );

    for (const vehicle of vehicles) {
      // PAY-19 — each month is priced at the route type the vehicle had on its
      // 1st, at the amount in force for that route type then.
      const amountOn = (at: Date) =>
        resolveFeeAmountAtKobo({
          at,
          routeTypeId: routeTypeInForce(
            at,
            vehicle.routeTypeChanges,
            vehicle.routeTypeId,
          ),
          current: {
            defaultAmountKobo: feeType.amountKobo,
            prices: feeType.prices,
          },
          history: feeType.amountHistory,
        });

      const schedule = levySchedule({
        onboardedAt: firstAttachment.get(vehicle.id) ?? null,
        now,
        creditKobo: credits.get(vehicle.id) ?? 0,
        amountForMonth: amountOn,
        // PAY-19 — nothing falls due after the month of retirement.
        retiredAt: vehicle.retiredAt,
      });

      result.set(vehicle.id, {
        vehicleId: vehicle.id,
        status: schedule.status,
        firstDueOn: schedule.firstDueOn?.toISOString() ?? null,
        monthsDue: schedule.months.length,
        unpaidMonths: schedule.months
          .filter((month) => month.outstandingKobo > 0)
          .map((month) => ({
            month: month.month,
            dueOn: month.dueOn.toISOString(),
            amountKobo: month.amountKobo,
            paidKobo: month.paidKobo,
            outstandingKobo: month.outstandingKobo,
          })),
        outstandingKobo: schedule.outstandingKobo,
        creditKobo: schedule.creditKobo,
        nextDueOn: schedule.nextDueOn?.toISOString() ?? null,
        currentAmountKobo: amountOn(now),
      });
    }
    return result;
  }

  /**
   * The membership fee for one member. **Not authorised here**, as above.
   */
  async memberDues(memberId: string, now = new Date()): Promise<MemberDues> {
    const [member, feeType, approval, payments] = await Promise.all([
      this.prisma.member.findUnique({
        where: { id: memberId },
        select: { legacyId: true },
      }),
      this.feeType(MEMBERSHIP),
      this.prisma.membershipApplication.findUnique({
        where: { memberId },
        select: { status: true, reviewedAt: true },
      }),
      this.prisma.payment.findMany({
        where: {
          subjectType: 'member',
          subjectId: memberId,
          status: 'CONFIRMED',
          feeType: { code: MEMBERSHIP },
        },
        select: {
          createdAt: true,
          confirmedAt: true,
          ledgerEntries: { select: { direction: true, amountKobo: true } },
        },
      }),
    ]);
    if (!member) {
      throw new NotFoundException();
    }

    // It first falls due on approval, or on the go-live date for a member
    // migrated before it (Requirement 27.13).
    let firstDueOn: Date | null = null;
    let notStartedBecause: MemberDues['notStartedBecause'] = null;
    if (approval?.status === 'APPROVED' && approval.reviewedAt) {
      firstDueOn = approval.reviewedAt;
    } else if (member.legacyId) {
      firstDueOn = await this.settings.getDate(DUES_GO_LIVE_DATE);
      if (!firstDueOn) {
        notStartedBecause = 'NO_GO_LIVE_DATE';
      }
    } else {
      notStartedBecause = 'NOT_APPROVED';
    }

    // A payment counts for what the ledger still holds of it: a refund is a
    // reversing entry (Requirement 27.9), and a fully reversed payment covers
    // nothing. A dedicated-account allocation may hold part of a fee (item 23).
    const cover = membershipCover({
      firstDueOn,
      now,
      payments: payments
        .filter((payment) => payment.confirmedAt !== null)
        .map((payment) => ({
          paidOn: payment.confirmedAt!,
          pricedOn: payment.createdAt,
          kobo: payment.ledgerEntries.reduce(
            (net, entry) =>
              net + (entry.direction === 'CREDIT' ? entry.amountKobo : -entry.amountKobo),
            0,
          ),
        })),
      amountAt: (at) =>
        resolveFeeAmountAtKobo({
          at,
          routeTypeId: null,
          current: { defaultAmountKobo: feeType.amountKobo, prices: [] },
          history: feeType.amountHistory,
        }),
    });

    return {
      memberId,
      status: cover.status,
      firstDueOn: cover.firstDueOn?.toISOString() ?? null,
      coveredUntil: cover.coveredUntil?.toISOString() ?? null,
      owedSince: cover.owedSince?.toISOString() ?? null,
      notStartedBecause: cover.status === 'NOT_DUE' ? notStartedBecause : null,
      currentAmountKobo: feeType.amountKobo,
      heldKobo: cover.heldKobo,
      outstandingKobo: cover.outstandingKobo,
    };
  }

  /**
   * Everything a member owes now: their membership fee, and the levy on every
   * vehicle linked to them as its driver (Requirement 9.10). What
   * dedicated-account money is allocated against (item 23). **Not authorised
   * here**, as above.
   *
   * Every linked vehicle counts, whatever its declaration status: a levy
   * never stops on its own (PAY-19, built as written).
   */
  async memberOutstanding(memberId: string, now = new Date()): Promise<MemberOutstanding> {
    const [membership, linked] = await Promise.all([
      this.memberDues(memberId, now),
      this.prisma.vehicle.findMany({
        where: { declaredByMemberId: memberId },
        select: { id: true, plateNumberDisplay: true },
        orderBy: { id: 'asc' },
      }),
    ]);
    const levies = await this.vehiclesDues(
      linked.map((vehicle) => vehicle.id),
      now,
    );
    const vehicles = linked.map((vehicle) => ({
      vehicleId: vehicle.id,
      plate: vehicle.plateNumberDisplay,
      dues: levies.get(vehicle.id)!,
    }));

    const dues: OutstandingDue[] = [];
    if (membership.status === 'OWED' && membership.owedSince && membership.outstandingKobo > 0) {
      const owedSince = new Date(membership.owedSince);
      dues.push({
        subjectType: 'member',
        subjectId: memberId,
        feeTypeCode: MEMBERSHIP,
        period: lagosDate(owedSince),
        dueOn: owedSince,
        outstandingKobo: membership.outstandingKobo,
      });
    }
    for (const vehicle of vehicles) {
      for (const month of vehicle.dues.unpaidMonths) {
        dues.push({
          subjectType: 'vehicle',
          subjectId: vehicle.vehicleId,
          feeTypeCode: LEVY,
          period: month.month,
          dueOn: new Date(month.dueOn),
          outstandingKobo: month.outstandingKobo,
        });
      }
    }
    return { dues, membership, vehicles };
  }

  /** Read whether or not the fee type is active: a retired fee still has a past. */
  private async feeType(code: string) {
    const feeType = await this.prisma.feeType.findUnique({
      where: { code },
      select: {
        id: true,
        amountKobo: true,
        prices: { select: { routeTypeId: true, amountKobo: true } },
        amountHistory: {
          select: { routeTypeId: true, amountKobo: true, effectiveFrom: true },
        },
      },
    });
    if (!feeType) {
      throw new NotFoundException(`No fee type "${code}".`);
    }
    return feeType;
  }

  /**
   * What the ledger holds for each of several subjects and one fee: credits
   * less reversing debits, in one statement. Only a confirmed payment has
   * entries at all. A subject with none is absent from the map.
   */
  private async ledgerCreditsKobo(
    feeTypeCode: string,
    subjectType: 'member' | 'vehicle',
    subjectIds: readonly string[],
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<
      { subjectId: string; direction: 'CREDIT' | 'DEBIT'; total: number }[]
    >`
      SELECT p.subject_id::text AS "subjectId",
             le.direction::text AS direction,
             COALESCE(SUM(le.amount_kobo), 0)::int AS total
      FROM ledger_entry le
      JOIN payment p ON p.id = le.payment_id
      JOIN fee_type ft ON ft.id = p.fee_type_id
      WHERE p.subject_type = ${subjectType}
        AND ft.code = ${feeTypeCode}
        AND p.subject_id = ANY(${[...subjectIds]}::uuid[])
      GROUP BY p.subject_id, le.direction`;
    const net = new Map<string, number>();
    for (const row of rows) {
      net.set(
        row.subjectId,
        (net.get(row.subjectId) ?? 0) +
          (row.direction === 'CREDIT' ? row.total : -row.total),
      );
    }
    return net;
  }
}
