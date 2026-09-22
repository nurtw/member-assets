import { BadRequestException, Injectable } from '@nestjs/common';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaystackClient } from './paystack/paystack.client.js';

export interface SetSettlementAccountInput {
  bankCode: string;
  bankName: string;
  accountNumber: string;
  actorUserId: string;
  reason: string;
  ipAddress?: string;
  requestId?: string;
}

/**
 * The NURTW settlement account (Requirement 27.12, `QUESTIONS.md` PAY-13).
 *
 * There is deliberately no second-approver step here — the owner's explicit
 * instruction was "we do not need two admin to approve, just proper audit
 * logs." The control is that every attempt, successful or not, is written
 * to `AuditEvent` with full before/after values and a mandatory reason; the
 * caller (the controller) is responsible for the password re-entry that
 * `payment.manage_settlement`'s `requiresStepUp` flag calls for.
 */
@Injectable()
export class SettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackClient,
    private readonly audit: AuditService,
  ) {}

  async getActive() {
    return this.prisma.settlementAccount.findFirst({
      where: { isActive: true },
    });
  }

  /**
   * Resolves the account name for confirmation before saving — Requirement
   * 27.12 requires the administrator to see it, never type it.
   */
  async resolveAccountName(accountNumber: string, bankCode: string) {
    return this.paystack.resolveAccountNumber(accountNumber, bankCode);
  }

  /**
   * Creates the subaccount on the first call, or updates the SAME
   * subaccount's bank details on every later call. Never creates a second
   * subaccount — that would strand dedicated accounts and payment links
   * already settling to the first one.
   */
  async set(input: SetSettlementAccountInput) {
    const existing = await this.getActive();

    let resolved: { accountName: string };
    try {
      resolved = await this.resolveAccountName(
        input.accountNumber,
        input.bankCode,
      );
    } catch (error) {
      await this.audit.record({
        action: 'payment.settlement.update',
        subjectType: 'settlement_account',
        subjectId: existing?.id ?? null,
        actorUserId: input.actorUserId,
        reason: input.reason,
        ipAddress: input.ipAddress,
        requestId: input.requestId,
        after: {
          bankCode: input.bankCode,
          accountNumber: input.accountNumber,
          outcome: 'REJECTED_BY_PAYSTACK',
        },
      });
      throw new BadRequestException(
        'Paystack could not resolve this account. No change was made.',
      );
    }

    const before = existing
      ? {
          bankCode: existing.bankCode,
          accountNumber: existing.accountNumber,
          accountName: existing.accountName,
          subaccountCode: existing.subaccountCode,
        }
      : null;

    let saved;
    if (existing) {
      await this.paystack.updateSubaccount(existing.subaccountCode, {
        businessName: 'NURTW Anambra State Council',
        bankCode: input.bankCode,
        accountNumber: input.accountNumber,
      });
      saved = await this.prisma.settlementAccount.update({
        where: { id: existing.id },
        data: {
          bankCode: input.bankCode,
          bankName: input.bankName,
          accountNumber: input.accountNumber,
          accountName: resolved.accountName,
        },
      });
    } else {
      const created = await this.paystack.createSubaccount({
        businessName: 'NURTW Anambra State Council',
        bankCode: input.bankCode,
        accountNumber: input.accountNumber,
        // The percentage is nominal — every real split uses
        // `transaction_charge` per payment (Requirement 27.4), never this
        // default percentage.
        percentageCharge: 0,
      });
      saved = await this.prisma.settlementAccount.create({
        data: {
          bankCode: input.bankCode,
          bankName: input.bankName,
          accountNumber: input.accountNumber,
          accountName: resolved.accountName,
          subaccountCode: created.subaccountCode,
        },
      });
    }

    await this.audit.record({
      action: 'payment.settlement.update',
      subjectType: 'settlement_account',
      subjectId: saved.id,
      actorUserId: input.actorUserId,
      reason: input.reason,
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      before,
      after: {
        bankCode: saved.bankCode,
        accountNumber: saved.accountNumber,
        accountName: saved.accountName,
        subaccountCode: saved.subaccountCode,
      },
    });

    return saved;
  }
}
