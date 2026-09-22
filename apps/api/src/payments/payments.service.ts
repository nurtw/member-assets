import { BadRequestException, Injectable } from '@nestjs/common';
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
  initiatedByUserId: string;
  callbackUrl?: string;
}

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

  async initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const feeType = await this.feeTypes.findByCode(input.feeTypeCode);

    if (feeType.isPlaceholder) {
      throw new BadRequestException(
        `Fee type "${feeType.code}" is a placeholder and cannot be charged live (Requirement 27.2).`,
      );
    }

    const dueKobo = feeType.amountKobo;
    const dueNaira = dueKobo / 100;
    const fees = calculateFees({
      due: dueNaira,
      contractorFee: DEFAULT_FEE_SCHEDULES.contractorFee,
      paystackFee: DEFAULT_FEE_SCHEDULES.paystackFee,
    });

    const contractorFeeKobo = Math.round(fees.contractorFee * 100);
    const totalChargedKobo = Math.round(fees.totalCharged * 100);
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

    const transaction = await this.paystack.initializeTransaction({
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
   * Confirms a payment. Requirement 27.5 — this is the ONLY path that marks
   * a payment CONFIRMED, and it always re-verifies against Paystack itself
   * rather than trusting the caller (webhook or manual poll) on its own.
   * Idempotent: a payment already CONFIRMED is returned as-is.
   */
  async confirm(reference: string): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { paystackReference: reference },
    });
    if (!payment || payment.status === 'CONFIRMED') {
      return;
    }

    const verification = await this.paystack.verifyTransaction(reference);
    if (
      verification.status !== 'success' ||
      verification.amountKobo !== payment.totalChargedKobo ||
      verification.currency !== 'NGN'
    ) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });
      return;
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
  }
}
