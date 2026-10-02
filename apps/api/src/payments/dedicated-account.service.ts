import {
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type {
  DedicatedAccountState,
  DedicatedAccountUnassignableReason,
} from '@nurtw/contracts';
import {
  allocateCredit,
  amountToSendKobo,
  dedicatedCreditKobo,
  parseAllocationOrder,
} from '@nurtw/domain';
import { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service.js';
import { PermissionService } from '../auth/permission.service.js';
import { loadEnvironment } from '../config/environment.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  DEDICATED_ALLOCATION_ORDER,
  DEDICATED_CONTRACTOR_PERCENTAGE,
  SettingsService,
} from '../settings/settings.service.js';
import { DuesService, LEVY, MEMBERSHIP } from './dues.service.js';
import { PaystackClient } from './paystack/paystack.client.js';
import { SettlementService } from './settlement.service.js';

/** Paystack's channel name for a transfer into a dedicated account. */
const DEDICATED_CHANNEL = 'dedicated_nuban';

/** How often held credit is checked against dues that have since fallen. */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/** How many transfers the member screen lists. */
const RECENT_TRANSFERS = 20;

/**
 * Dedicated accounts (PRD Requirement 27.7, `QUESTIONS.md` PAY-06, PAY-11,
 * PAY-12, PAY-17 — item 23).
 *
 * A member is assigned one Paystack dedicated account, split to the NURTW
 * subaccount, so the Union's money never passes through the contractor. The
 * member sends what they choose, when they choose:
 *
 * 1. Paystack's webhook names a transfer. It is re-verified with Paystack
 *    (Requirement 27.5) and matched to its member by customer code.
 * 2. It is credited with what NURTW received: Paystack's own split figure, or
 *    the contractor percentage when Paystack gives none.
 * 3. The credit pays the member's oldest outstanding dues first, across the
 *    membership fee and the levy on each of their vehicles (PAY-12), as one
 *    `DEDICATED_ACCOUNT` payment per due period. Item 22's schedule reads
 *    those like any other payment.
 * 4. Whatever is left is held. An hourly sweep pays it into dues as they fall.
 *
 * One member's money is allocated under a row lock on their dedicated
 * account, so two transfers arriving together cannot both pay the same month.
 */
@Injectable()
export class DedicatedAccountService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DedicatedAccountService.name);
  private sweepTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly paystack: PaystackClient,
    private readonly settlement: SettlementService,
    private readonly settings: SettingsService,
    private readonly dues: DuesService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    // Not under test: a suite drives the sweep itself, at the time it chooses.
    if (loadEnvironment().nodeEnv === 'test') {
      return;
    }
    this.sweepTimer = setInterval(() => {
      void this.sweep().catch((error: unknown) =>
        this.logger.error(`Held-credit sweep failed: ${String(error)}`),
      );
    }, SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
    }
  }

  // --- Reading ----------------------------------------------------------------

  /**
   * `GET /members/:id/dedicated-account`. Internal only, like dues
   * (Requirement 27.8). Out of scope answers 404, like no such member.
   */
  async state(userId: string, memberId: string, now = new Date()): Promise<DedicatedAccountState> {
    await this.memberInScope(userId, memberId, 'payment.read');

    const [account, unassignableBecause, percentage, outstanding, transfers, held] =
      await Promise.all([
        this.activeAccount(memberId),
        this.unassignableBecause(memberId),
        this.settings.getPercentage(DEDICATED_CONTRACTOR_PERCENTAGE),
        this.dues.memberOutstanding(memberId, now),
        this.prisma.dedicatedAccountTransfer.findMany({
          where: { memberId },
          orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
          take: RECENT_TRANSFERS,
          select: {
            paystackReference: true,
            receivedAt: true,
            amountKobo: true,
            creditKobo: true,
            creditBasis: true,
            allocations: {
              orderBy: { paystackReference: 'asc' },
              select: {
                subjectType: true,
                subjectId: true,
                dueKobo: true,
                duePeriod: true,
                createdAt: true,
                feeType: { select: { code: true } },
              },
            },
          },
        }),
        this.heldCreditKobo(memberId),
      ]);

    const toSend = (creditKobo: number) => ({
      creditKobo,
      sendKobo: percentage === null ? null : amountToSendKobo(creditKobo, percentage),
    });

    const plates = new Map(
      outstanding.vehicles.map((vehicle) => [vehicle.vehicleId, vehicle.plate]),
    );
    const missing = transfers
      .flatMap((transfer) => transfer.allocations)
      .filter((allocation) => allocation.subjectType === 'vehicle')
      .map((allocation) => allocation.subjectId)
      .filter((id) => !plates.has(id));
    if (missing.length > 0) {
      // A vehicle since linked to another member still appears under the
      // transfer that paid it.
      for (const vehicle of await this.prisma.vehicle.findMany({
        where: { id: { in: [...new Set(missing)] } },
        select: { id: true, plateNumberDisplay: true },
      })) {
        plates.set(vehicle.id, vehicle.plateNumberDisplay);
      }
    }

    return {
      memberId,
      account: account
        ? {
            accountNumber: account.accountNumber,
            accountName: account.accountName,
            bankName: account.bankName,
            assignedAt: account.assignedAt.toISOString(),
          }
        : null,
      unassignableBecause,
      contractorPercentage: percentage,
      heldCreditKobo: held,
      owedNow: toSend(outstanding.dues.reduce((sum, due) => sum + due.outstandingKobo, 0)),
      monthlyLevy: outstanding.vehicles.map((vehicle) => ({
        vehicleId: vehicle.vehicleId,
        plate: vehicle.plate,
        ...toSend(vehicle.dues.currentAmountKobo),
      })),
      transfers: transfers.map((transfer) => {
        const allocated = transfer.allocations.reduce((sum, a) => sum + a.dueKobo, 0);
        return {
          reference: transfer.paystackReference,
          receivedAt: transfer.receivedAt.toISOString(),
          amountKobo: transfer.amountKobo,
          creditKobo: transfer.creditKobo,
          creditBasis: transfer.creditBasis,
          heldKobo: transfer.creditKobo - allocated,
          allocations: transfer.allocations.map((allocation) => ({
            subjectType: allocation.subjectType === 'member' ? 'member' : 'vehicle',
            subjectId: allocation.subjectId,
            label:
              allocation.subjectType === 'member'
                ? 'Membership fee'
                : (plates.get(allocation.subjectId) ?? 'Vehicle'),
            feeTypeCode: allocation.feeType.code,
            period: allocation.duePeriod ?? '',
            amountKobo: allocation.dueKobo,
            allocatedAt: allocation.createdAt.toISOString(),
          })),
        };
      }),
    };
  }

  // --- Assigning ----------------------------------------------------------------

  /**
   * `POST /members/:id/dedicated-account`. Creates the Paystack customer and
   * opens the account with the NURTW subaccount.
   *
   * Requirement 27.7 — Paystack is sent only what it requires: the email the
   * officer gives, the member's names, and their phone. Nothing else about
   * the member leaves the System.
   */
  async assign(userId: string, memberId: string, email: string) {
    await this.memberInScope(userId, memberId, 'payment.initiate');

    const refusal = await this.unassignableBecause(memberId);
    if (refusal) {
      throw new ConflictException(`A dedicated account cannot be assigned: ${refusal}.`);
    }

    const [member, settlementAccount] = await Promise.all([
      this.prisma.member.findUniqueOrThrow({
        where: { id: memberId },
        select: {
          firstName: true,
          surname: true,
          contact: { select: { phone: true } },
        },
      }),
      this.settlement.getActive(),
    ]);

    let opened: Awaited<ReturnType<PaystackClient['createDedicatedAccount']>>;
    let customerCode: string;
    try {
      ({ customerCode } = await this.paystack.createCustomer({
        email,
        firstName: member.firstName,
        lastName: member.surname,
        phone: member.contact!.phone,
      }));
      opened = await this.paystack.createDedicatedAccount({
        customerCode,
        subaccountCode: settlementAccount!.subaccountCode,
        preferredBank: loadEnvironment().paystackDvaPreferredBank,
      });
    } catch {
      // Paystack's own message is in the client's log line. The audit entry
      // records the attempt, not the member's details.
      await this.audit.record({
        action: 'payment.dedicated_account.assign',
        subjectType: 'member',
        subjectId: memberId,
        actorUserId: userId,
        after: { outcome: 'REJECTED_BY_PAYSTACK' },
      });
      throw new BadGatewayException('Paystack did not open the account.');
    }

    let account;
    try {
      account = await this.prisma.dedicatedAccount.create({
        data: {
          memberId,
          paystackCustomerCode: customerCode,
          paystackAccountId: opened.id,
          accountNumber: opened.accountNumber,
          accountName: opened.accountName,
          bankName: opened.bankName,
          bankSlug: opened.bankSlug,
          assignedByUserId: userId,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Two officers at once: the partial unique index let only one through.
        throw new ConflictException('A dedicated account cannot be assigned: ALREADY_ASSIGNED.');
      }
      throw error;
    }

    await this.audit.record({
      action: 'payment.dedicated_account.assign',
      subjectType: 'member',
      subjectId: memberId,
      actorUserId: userId,
      after: {
        outcome: 'ASSIGNED',
        dedicatedAccountId: account.id,
        accountNumber: account.accountNumber,
        bankName: account.bankName,
        paystackCustomerCode: customerCode,
        subaccountCode: settlementAccount!.subaccountCode,
      },
    });

    return {
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      bankName: account.bankName,
      assignedAt: account.assignedAt.toISOString(),
    };
  }

  // --- Receiving ------------------------------------------------------------------

  /**
   * A transfer into a dedicated account, named by Paystack's webhook.
   *
   * Never trusts the webhook's own figures (Requirement 27.5): the transaction
   * is fetched from Paystack and checked. Idempotent by reference, so a
   * replayed webhook records nothing new. A transfer that cannot be matched to
   * a member is audited for follow-up rather than refused, because Paystack
   * would only send it again.
   */
  async receive(reference: string, now = new Date()): Promise<void> {
    const seen = await this.prisma.dedicatedAccountTransfer.findUnique({
      where: { paystackReference: reference },
      select: { id: true },
    });
    if (seen) {
      return;
    }

    const verified = await this.paystack.verifyTransaction(reference);
    if (
      verified.status !== 'success' ||
      verified.currency !== 'NGN' ||
      verified.channel !== DEDICATED_CHANNEL ||
      !(verified.amountKobo > 0)
    ) {
      await this.audit.record({
        action: 'payment.dedicated.refused',
        subjectType: 'dedicated_account_transfer',
        after: {
          reference,
          status: verified.status,
          channel: verified.channel,
          currency: verified.currency,
        },
      });
      return;
    }

    const account = verified.customerCode
      ? await this.prisma.dedicatedAccount.findFirst({
          where: {
            paystackCustomerCode: verified.customerCode,
            ...(verified.receiverAccountNumber
              ? { accountNumber: verified.receiverAccountNumber }
              : {}),
          },
          orderBy: [{ active: 'desc' }, { assignedAt: 'desc' }],
          select: { id: true, memberId: true },
        })
      : null;
    if (!account) {
      await this.audit.record({
        action: 'payment.dedicated.unmatched',
        subjectType: 'dedicated_account_transfer',
        after: { reference, amountKobo: verified.amountKobo },
      });
      this.logger.warn(`Dedicated-account transfer ${reference} matched no member.`);
      return;
    }

    const credit = await this.creditFor(verified.amountKobo, verified.subaccountShareKobo);
    if (!credit) {
      // Neither Paystack's figure nor a percentage to work one out: refuse to
      // guess, and let Paystack retry once the setting is made.
      await this.audit.record({
        action: 'payment.dedicated.unpriced',
        subjectType: 'dedicated_account_transfer',
        after: { reference, amountKobo: verified.amountKobo },
      });
      throw new ServiceUnavailableException();
    }

    try {
      await this.prisma.$transaction(
        async (tx) => {
          await this.lockMember(tx, account.memberId);
          const transfer = await tx.dedicatedAccountTransfer.create({
            data: {
              dedicatedAccountId: account.id,
              memberId: account.memberId,
              paystackReference: reference,
              amountKobo: verified.amountKobo,
              creditKobo: credit.creditKobo,
              creditBasis: credit.basis,
              paystackFeeKobo: verified.feesKobo,
              receivedAt: verified.paidAt ? new Date(verified.paidAt) : now,
            },
          });
          await this.audit.record(
            {
              action: 'payment.dedicated.receive',
              subjectType: 'dedicated_account_transfer',
              subjectId: transfer.id,
              after: {
                reference,
                memberId: account.memberId,
                amountKobo: verified.amountKobo,
                creditKobo: credit.creditKobo,
                creditBasis: credit.basis,
              },
            },
            tx,
          );
          await this.allocateHeld(tx, account.memberId, now);
        },
        { maxWait: 10_000, timeout: 30_000 },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return; // A concurrent delivery of the same webhook recorded it first.
      }
      throw error;
    }
  }

  /**
   * Pays held credit into dues that have fallen since it arrived: the next
   * month's levy, or a membership fee that has lapsed. Returns how many
   * members it allocated for. Runs hourly; safe to run twice.
   */
  async sweep(now = new Date()): Promise<number> {
    const holding = await this.prisma.$queryRaw<{ memberId: string }[]>`
      SELECT DISTINCT t.member_id AS "memberId"
      FROM (
        SELECT t.id, t.member_id, t.credit_kobo
        FROM dedicated_account_transfer t
        LEFT JOIN payment p ON p.dedicated_transfer_id = t.id
        GROUP BY t.id, t.member_id, t.credit_kobo
        HAVING t.credit_kobo > COALESCE(SUM(p.due_kobo), 0)
      ) t`;

    let allocatedFor = 0;
    for (const { memberId } of holding) {
      try {
        const made = await this.prisma.$transaction(
          async (tx) => {
            await this.lockMember(tx, memberId);
            return this.allocateHeld(tx, memberId, now);
          },
          { maxWait: 10_000, timeout: 30_000 },
        );
        if (made > 0) {
          allocatedFor += 1;
        }
      } catch (error) {
        // One member's failure must not hold up everyone else's credit.
        this.logger.error(`Held credit for member ${memberId} not applied: ${String(error)}`);
      }
    }
    return allocatedFor;
  }

  // --- Internals ------------------------------------------------------------------

  /**
   * Allocates every transfer's held credit, oldest transfer first, against
   * what the member owes now. Call inside a transaction holding the member's
   * lock. Returns the number of payments written.
   *
   * What is owed is read through the ordinary client, outside this
   * transaction. That is sound under the lock: any earlier allocation for this
   * member has committed before the lock was granted, and this one writes
   * nothing until the reading is done.
   */
  private async allocateHeld(
    tx: Prisma.TransactionClient,
    memberId: string,
    now: Date,
  ): Promise<number> {
    const transfers = await tx.dedicatedAccountTransfer.findMany({
      where: { memberId },
      orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        paystackReference: true,
        creditKobo: true,
        allocations: { select: { dueKobo: true } },
      },
    });
    const holding = transfers
      .map((transfer) => ({
        ...transfer,
        allocationCount: transfer.allocations.length,
        heldKobo:
          transfer.creditKobo -
          transfer.allocations.reduce((sum, allocation) => sum + allocation.dueKobo, 0),
      }))
      .filter((transfer) => transfer.heldKobo > 0);
    if (holding.length === 0) {
      return 0;
    }

    const [{ dues }, orderSetting, feeTypes] = await Promise.all([
      this.dues.memberOutstanding(memberId, now),
      this.settings.getString(DEDICATED_ALLOCATION_ORDER),
      tx.feeType.findMany({
        where: { code: { in: [LEVY, MEMBERSHIP] } },
        select: { id: true, code: true },
      }),
    ]);
    const order = parseAllocationOrder(orderSetting);
    const feeTypeId = new Map(feeTypes.map((feeType) => [feeType.code, feeType.id]));

    let outstanding = dues;
    let written = 0;
    for (const transfer of holding) {
      if (outstanding.length === 0) {
        break;
      }
      const result = allocateCredit({
        creditKobo: transfer.heldKobo,
        dues: outstanding,
        order,
      });
      outstanding = result.outstanding;
      if (result.allocations.length === 0) {
        continue;
      }

      let sequence = transfer.allocationCount;
      for (const allocation of result.allocations) {
        sequence += 1;
        const payment = await tx.payment.create({
          data: {
            feeTypeId: feeTypeId.get(allocation.feeTypeCode)!,
            subjectType: allocation.subjectType,
            subjectId: allocation.subjectId,
            dueKobo: allocation.amountKobo,
            // PAY-11 — the contractor's share was taken at Paystack's split,
            // not added on top, so there is no fee line on this payment.
            contractorFeeKobo: 0,
            totalChargedKobo: allocation.amountKobo,
            channel: 'DEDICATED_ACCOUNT',
            status: 'CONFIRMED',
            paystackReference: `${transfer.paystackReference}:${sequence}`,
            dedicatedTransferId: transfer.id,
            duePeriod: allocation.period,
            createdAt: now,
            confirmedAt: now,
          },
        });
        await tx.ledgerEntry.create({
          data: {
            paymentId: payment.id,
            direction: 'CREDIT',
            amountKobo: allocation.amountKobo,
            description: `Dedicated account: ${allocation.feeTypeCode} ${allocation.period}`,
          },
        });
        written += 1;
      }

      await this.audit.record(
        {
          action: 'payment.dedicated.allocate',
          subjectType: 'dedicated_account_transfer',
          subjectId: transfer.id,
          after: {
            order,
            allocations: result.allocations.map((allocation) => ({
              subjectType: allocation.subjectType,
              subjectId: allocation.subjectId,
              feeTypeCode: allocation.feeTypeCode,
              period: allocation.period,
              amountKobo: allocation.amountKobo,
            })),
            heldKobo: result.remainingKobo,
          },
        },
        tx,
      );
    }
    return written;
  }

  /** Serialises allocation for one member (see the class comment). */
  private async lockMember(tx: Prisma.TransactionClient, memberId: string): Promise<void> {
    await tx.$queryRaw`
      SELECT id FROM dedicated_account WHERE member_id = ${memberId}::uuid FOR UPDATE`;
  }

  /**
   * What NURTW received. Paystack's own split figure is what really settled;
   * the percentage is the fallback, rounded so a member is never credited
   * more than NURTW got. `null` when neither is available.
   */
  private async creditFor(
    amountKobo: number,
    subaccountShareKobo: number | null,
  ): Promise<{ creditKobo: number; basis: 'PAYSTACK_SPLIT' | 'PERCENTAGE_SETTING' } | null> {
    if (
      subaccountShareKobo !== null &&
      subaccountShareKobo >= 0 &&
      subaccountShareKobo <= amountKobo
    ) {
      return { creditKobo: subaccountShareKobo, basis: 'PAYSTACK_SPLIT' };
    }
    const percentage = await this.settings.getPercentage(DEDICATED_CONTRACTOR_PERCENTAGE);
    if (percentage === null) {
      return null;
    }
    return {
      creditKobo: dedicatedCreditKobo(amountKobo, percentage),
      basis: 'PERCENTAGE_SETTING',
    };
  }

  /** Credit received and not yet allocated, across all a member's transfers. */
  private async heldCreditKobo(memberId: string): Promise<number> {
    const [received, allocated] = await Promise.all([
      this.prisma.dedicatedAccountTransfer.aggregate({
        where: { memberId },
        _sum: { creditKobo: true },
      }),
      this.prisma.payment.aggregate({
        where: { dedicatedTransfer: { memberId } },
        _sum: { dueKobo: true },
      }),
    ]);
    return (received._sum.creditKobo ?? 0) - (allocated._sum.dueKobo ?? 0);
  }

  private activeAccount(memberId: string) {
    return this.prisma.dedicatedAccount.findFirst({
      where: { memberId, active: true },
      select: { accountNumber: true, accountName: true, bankName: true, assignedAt: true },
    });
  }

  /** Why `assign` would refuse now, in the order an officer can act on. */
  private async unassignableBecause(
    memberId: string,
  ): Promise<DedicatedAccountUnassignableReason | null> {
    const [account, member, settlementAccount, percentage] = await Promise.all([
      this.activeAccount(memberId),
      this.prisma.member.findUnique({
        where: { id: memberId },
        select: { status: true, contact: { select: { phone: true } } },
      }),
      this.settlement.getActive(),
      this.settings.getPercentage(DEDICATED_CONTRACTOR_PERCENTAGE),
    ]);
    if (account) {
      return 'ALREADY_ASSIGNED';
    }
    if (member?.status !== 'ACTIVE') {
      return 'NOT_ACTIVE_MEMBER';
    }
    if (!member.contact?.phone?.trim()) {
      return 'NO_PHONE_ON_RECORD';
    }
    if (!settlementAccount) {
      return 'NO_SETTLEMENT_ACCOUNT';
    }
    if (percentage === null) {
      return 'NO_CONTRACTOR_PERCENTAGE';
    }
    return null;
  }

  /** 404 for a member outside the caller's scope, exactly as for no member. */
  private async memberInScope(
    userId: string,
    memberId: string,
    permission: string,
  ): Promise<void> {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: { organisation: { select: { path: true } } },
    });
    if (!member || !(await this.permissions.can(userId, permission, member.organisation.path))) {
      throw new NotFoundException();
    }
  }
}
