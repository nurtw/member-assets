import { BadRequestException, Injectable } from '@nestjs/common';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  DEDICATED_CONTRACTOR_PERCENTAGE,
  SettingsService,
} from '../settings/settings.service.js';
import {
  NURTW_BUSINESS_NAME,
  PaystackClient,
} from './paystack/paystack.client.js';

export interface SetDedicatedPercentageInput {
  percentage: number;
  actorUserId: string;
  reason: string;
  ipAddress?: string;
  requestId?: string;
}

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
    private readonly settings: SettingsService,
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
        businessName: NURTW_BUSINESS_NAME,
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
        businessName: NURTW_BUSINESS_NAME,
        bankCode: input.bankCode,
        accountNumber: input.accountNumber,
        // A payment link overrides this with its own `transaction_charge`
        // (Requirement 27.4). A dedicated-account transfer cannot, so the
        // percentage is the contractor's share of those (Requirement 27.7):
        // the setting if it has been made, and nothing until then.
        percentageCharge:
          (await this.settings.getPercentage(DEDICATED_CONTRACTOR_PERCENTAGE)) ?? 0,
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

  /**
   * Sets the contractor's percentage of dedicated-account money (Requirement
   * 27.7, PAY-11). It decides how much of every transfer reaches the Union,
   * so it is guarded like the account itself: the controller has checked the
   * password, and every attempt is audited with its reason.
   *
   * Paystack first, then the setting. If Paystack refuses, nothing changes
   * here, so the setting never claims a split Paystack is not applying.
   */
  async setDedicatedPercentage(input: SetDedicatedPercentageInput) {
    const before = await this.settings.getPercentage(DEDICATED_CONTRACTOR_PERCENTAGE);
    const auditBase = {
      action: 'payment.settlement.dedicated_percentage',
      subjectType: 'settlement_account',
      actorUserId: input.actorUserId,
      reason: input.reason,
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      before: { percentage: before },
    };

    const account = await this.getActive();
    if (!account) {
      await this.audit.record({
        ...auditBase,
        after: { percentage: input.percentage, outcome: 'REJECTED_NO_SETTLEMENT_ACCOUNT' },
      });
      throw new BadRequestException(
        'Add the NURTW settlement account before setting its percentage.',
      );
    }

    try {
      await this.paystack.updateSubaccountPercentage(
        account.subaccountCode,
        input.percentage,
      );
    } catch {
      await this.audit.record({
        ...auditBase,
        subjectId: account.id,
        after: { percentage: input.percentage, outcome: 'REJECTED_BY_PAYSTACK' },
      });
      throw new BadRequestException(
        'Paystack did not accept the percentage. No change was made.',
      );
    }

    await this.settings.set(
      DEDICATED_CONTRACTOR_PERCENTAGE,
      String(input.percentage),
      input.actorUserId,
    );
    await this.audit.record({
      ...auditBase,
      subjectId: account.id,
      after: {
        percentage: input.percentage,
        subaccountCode: account.subaccountCode,
        outcome: 'APPLIED',
      },
    });
    return { percentage: input.percentage };
  }
}
