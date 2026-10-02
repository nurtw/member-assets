import { Injectable, NotFoundException } from '@nestjs/common';
import type { MemberDues, VehicleDues } from '@nurtw/contracts';
import {
  levySchedule,
  membershipCover,
  resolveFeeAmountAtKobo,
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
const LEVY = 'LEVY';
const MEMBERSHIP = 'MEMBERSHIP';

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
    const [vehicle, feeType, firstAttachment, creditKobo] = await Promise.all([
      this.prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { routeTypeId: true },
      }),
      this.feeType(LEVY),
      // Onboarded when a sticker was first attached (Decision 6.5). A later
      // replacement does not restart the levy.
      this.prisma.sticker.findFirst({
        where: { vehicleId, attachedAt: { not: null } },
        orderBy: { attachedAt: 'asc' },
        select: { attachedAt: true },
      }),
      this.ledgerCreditKobo(LEVY, 'vehicle', vehicleId),
    ]);
    if (!vehicle) {
      throw new NotFoundException();
    }

    // PAY-19 (open): every month is priced at the route type the vehicle has
    // now, at the amount in force for it when that month fell due.
    const amountOn = (at: Date) =>
      resolveFeeAmountAtKobo({
        at,
        routeTypeId: vehicle.routeTypeId,
        current: { defaultAmountKobo: feeType.amountKobo, prices: feeType.prices },
        history: feeType.amountHistory,
      });

    const schedule = levySchedule({
      onboardedAt: firstAttachment?.attachedAt ?? null,
      now,
      creditKobo,
      amountForMonth: amountOn,
    });

    return {
      vehicleId,
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
    };
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

    // A payment counts while the ledger still holds it: a refund is a
    // reversing entry (Requirement 27.9), and a fully reversed payment covers
    // nothing.
    const paidOn = payments
      .filter(
        (payment) =>
          payment.confirmedAt !== null &&
          payment.ledgerEntries.reduce(
            (net, entry) =>
              net + (entry.direction === 'CREDIT' ? entry.amountKobo : -entry.amountKobo),
            0,
          ) > 0,
      )
      .map((payment) => payment.confirmedAt!);

    const cover = membershipCover({ firstDueOn, paidOn, now });

    return {
      memberId,
      status: cover.status,
      firstDueOn: cover.firstDueOn?.toISOString() ?? null,
      coveredUntil: cover.coveredUntil?.toISOString() ?? null,
      owedSince: cover.owedSince?.toISOString() ?? null,
      notStartedBecause: cover.status === 'NOT_DUE' ? notStartedBecause : null,
      currentAmountKobo: feeType.amountKobo,
    };
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
   * What the ledger holds for one subject and fee: credits less reversing
   * debits. Only a confirmed payment has entries at all.
   */
  private async ledgerCreditKobo(
    feeTypeCode: string,
    subjectType: 'member' | 'vehicle',
    subjectId: string,
  ): Promise<number> {
    const totals = await this.prisma.ledgerEntry.groupBy({
      by: ['direction'],
      where: {
        payment: { subjectType, subjectId, feeType: { code: feeTypeCode } },
      },
      _sum: { amountKobo: true },
    });
    const sum = (direction: 'CREDIT' | 'DEBIT') =>
      totals.find((row) => row.direction === direction)?._sum.amountKobo ?? 0;
    return sum('CREDIT') - sum('DEBIT');
  }
}
