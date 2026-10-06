import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { CheckPaymentsResult } from '@nurtw/contracts';
import { calculateFees, DEFAULT_FEE_SCHEDULES } from '@nurtw/domain';
import { randomUUID } from 'node:crypto';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FeeTypeService } from './fee-type.service.js';
import { PaystackClient } from './paystack/paystack.client.js';
import { SettlementService } from './settlement.service.js';

export interface InitiatePaymentInput {
  feeTypeCode: string;
  subjectType: 'member' | 'vehicle';
  subjectId: string;
  payerEmail: string;
  /** `null` for a payment started from a public pay link (item 31). */
  initiatedByUserId: string | null;
  callbackUrl?: string;
  /** The pay link it was started from, recorded in the audit event. */
  payLinkId?: string;
}

/** What a fee costs for one subject, before anything is started. */
export interface PaymentQuote {
  feeTypeCode: string;
  label: string;
  isPlaceholder: boolean;
  active: boolean;
  dueKobo: number;
  contractorFeeKobo: number;
  totalChargedKobo: number;
}

/** How many of a subject's open payments one check asks Paystack about. */
const OPEN_PAYMENTS_CHECKED = 5;

export interface InitiatePaymentResult {
  paymentId: string;
  authorizationUrl: string;
  reference: string;
  dueKobo: number;
  contractorFeeKobo: number;
  totalChargedKobo: number;
}

/**
 * Starting a payment by link (Requirement 27.7). A sticker fee is
 * link-only; the NURTW dues path additionally supports a dedicated
 * account, which is not built here — see `plans/16-payments.md`, out of
 * scope for this slice.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly feeTypes: FeeTypeService,
    private readonly paystack: PaystackClient,
    private readonly settlement: SettlementService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The due and the fee on top (Requirement 27.3) for one subject. The public
   * pay page shows this; `initiate` charges it, so the two cannot differ.
   */
  async quote(
    feeTypeCode: string,
    subject: { type: 'member' | 'vehicle'; id: string },
  ): Promise<PaymentQuote> {
    const feeType = await this.feeTypes.findByCode(feeTypeCode);
    // Requirement 27.1 / PAY-14 — the levy charges the vehicle's route-type
    // amount where one is set.
    const dueKobo = await this.feeTypes.amountFor(feeType, subject);
    const fees = calculateFees({
      due: dueKobo / 100,
      contractorFee: DEFAULT_FEE_SCHEDULES.contractorFee,
      paystackFee: DEFAULT_FEE_SCHEDULES.paystackFee,
    });
    return {
      feeTypeCode: feeType.code,
      label: feeType.label,
      isPlaceholder: feeType.isPlaceholder,
      active: feeType.active,
      dueKobo,
      contractorFeeKobo: Math.round(fees.contractorFee * 100),
      totalChargedKobo: Math.round(fees.totalCharged * 100),
    };
  }

  async initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const feeType = await this.feeTypes.findByCode(input.feeTypeCode);

    if (feeType.isPlaceholder) {
      throw new BadRequestException(
        `Fee type "${feeType.code}" is a placeholder and cannot be charged live (Requirement 27.2).`,
      );
    }

    // Snapshotted onto the payment below, so a later re-price never changes
    // what this payment asked for.
    const { dueKobo, contractorFeeKobo, totalChargedKobo } = await this.quote(
      feeType.code,
      { type: input.subjectType, id: input.subjectId },
    );
    const reference = `nurtw_${randomUUID()}`;

    let subaccountCode: string | undefined;
    let transactionChargeKobo: number | undefined;
    if (feeType.settlement === 'SPLIT_WITH_NURTW') {
      const account = await this.settlement.getActive();
      if (!account) {
        throw new BadRequestException(
          'The NURTW settlement account has not been configured yet.',
        );
      }
      subaccountCode = account.subaccountCode;
      // The subaccount (NURTW) receives exactly the due; the main account
      // (the contractor) receives the rest, and bears Paystack's fee —
      // Requirement 27.4.
      transactionChargeKobo = totalChargedKobo - dueKobo;
    }

    const payment = await this.prisma.payment.create({
      data: {
        feeTypeId: feeType.id,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        dueKobo,
        contractorFeeKobo,
        totalChargedKobo,
        channel: 'LINK',
        status: 'PENDING',
        paystackReference: reference,
        initiatedByUserId: input.initiatedByUserId,
      },
    });

    let transaction: Awaited<
      ReturnType<PaystackClient['initializeTransaction']>
    >;
    try {
      transaction = await this.paystack.initializeTransaction({
        email: input.payerEmail,
        amountKobo: totalChargedKobo,
        reference,
        subaccountCode,
        transactionChargeKobo,
        callbackUrl: input.callbackUrl,
        metadata: {
          feeTypeCode: feeType.code,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
        },
      });
    } catch {
      // Paystack refused, or could not be reached: no payment page exists, so
      // nothing can ever confirm this record. It is closed as failed rather
      // than left pending for good, and the caller is told the provider is
      // unavailable, which a screen can explain (the 500 this used to be
      // could not).
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });
      await this.audit.record({
        action: 'payment.initiate_failed',
        subjectType: 'payment',
        subjectId: payment.id,
        actorUserId: input.initiatedByUserId,
        after: {
          feeTypeCode: feeType.code,
          reference,
          ...(input.payLinkId ? { payLinkId: input.payLinkId } : {}),
        },
      });
      throw new ServiceUnavailableException(
        'The payment provider did not start the payment.',
      );
    }

    await this.audit.record({
      action: 'payment.initiate',
      subjectType: 'payment',
      subjectId: payment.id,
      actorUserId: input.initiatedByUserId,
      after: {
        feeTypeCode: feeType.code,
        dueKobo,
        contractorFeeKobo,
        totalChargedKobo,
        reference,
        ...(input.payLinkId ? { payLinkId: input.payLinkId } : {}),
      },
    });

    return {
      paymentId: payment.id,
      authorizationUrl: transaction.authorizationUrl,
      reference,
      dueKobo,
      contractorFeeKobo,
      totalChargedKobo,
    };
  }

  /**
   * Confirms a payment. Requirement 27.5 — `settle` is the ONLY path that
   * marks a payment CONFIRMED, and it always re-verifies against Paystack
   * itself rather than trusting the caller (the webhook, or an officer's
   * check) on its own. Idempotent: a payment already CONFIRMED is left as-is.
   */
  async confirm(reference: string): Promise<void> {
    await this.settle(reference, 'CLOSE_IF_UNPAID');
  }

  /**
   * Asks Paystack about the payments still open for one vehicle or member
   * (Requirement 9A.7, revision 1.12), so an officer need not wait on the
   * webhook once a payer has paid. A check only ever confirms: a payer may
   * still be on Paystack's page, so a payment not yet successful is left
   * open for the webhook, never closed here. The few most recent are asked
   * about, so one call cannot be turned into many.
   */
  async checkOpen(subject: {
    type: 'member' | 'vehicle';
    id: string;
  }): Promise<CheckPaymentsResult> {
    const open = await this.prisma.payment.findMany({
      where: {
        subjectType: subject.type,
        subjectId: subject.id,
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
      take: OPEN_PAYMENTS_CHECKED,
      select: { paystackReference: true },
    });

    let confirmed = 0;
    for (const payment of open) {
      if (!payment.paystackReference) {
        continue;
      }
      try {
        if (await this.settle(payment.paystackReference, 'LEAVE_OPEN')) {
          confirmed += 1;
        }
      } catch {
        // Paystack has not heard of it (the payer never opened the page), or
        // could not be reached. Either way it stays open.
      }
    }
    return { checked: open.length, confirmed };
  }

  /** `true` when this call confirmed the payment. */
  private async settle(
    reference: string,
    ifUnpaid: 'CLOSE_IF_UNPAID' | 'LEAVE_OPEN',
  ): Promise<boolean> {
    const payment = await this.prisma.payment.findUnique({
      where: { paystackReference: reference },
    });
    if (!payment || payment.status === 'CONFIRMED') {
      return false;
    }

    const verification = await this.paystack.verifyTransaction(reference);
    if (
      verification.status !== 'success' ||
      verification.amountKobo !== payment.totalChargedKobo ||
      verification.currency !== 'NGN'
    ) {
      if (ifUnpaid === 'CLOSE_IF_UNPAID') {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'FAILED' },
        });
      }
      return false;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          paystackFeeKobo: verification.feesKobo ?? null,
        },
      });
      await tx.ledgerEntry.create({
        data: {
          paymentId: payment.id,
          direction: 'CREDIT',
          amountKobo: payment.dueKobo,
          description: 'Due settled',
        },
      });
      await this.audit.record(
        {
          action: 'payment.confirm',
          subjectType: 'payment',
          subjectId: payment.id,
          after: { reference, amountKobo: verification.amountKobo },
        },
        tx,
      );
    });
    return true;
  }
}
