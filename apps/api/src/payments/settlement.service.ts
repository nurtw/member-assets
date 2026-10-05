import { Injectable } from '@nestjs/common';
import type { PaystackBank, SettlementState } from '@nurtw/contracts';

import { AuditService } from '../audit/audit.service.js';
import { ValidationException } from '../common/zod-validation.pipe.js';
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

export interface ResolveSettlementAccountInput {
  bankCode: string;
  accountNumber: string;
  actorUserId: string;
  ipAddress?: string;
  requestId?: string;
}

/** Paystack's bank list changes rarely; an hour saves a call per page load. */
const BANK_LIST_TTL_MS = 60 * 60 * 1000;

/**
 * The answers the screen explains (item 30). Each describes the request just
 * sent, never the record set, so naming the field is within Requirement 14.3,
 * as item 28's password checks are.
 */
export function wrongPassword(): ValidationException {
  return new ValidationException([{ field: 'password', message: 'Incorrect password.' }]);
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

  private bankCache: { banks: PaystackBank[]; fetchedAt: number } | null = null;

  async getActive() {
    return this.prisma.settlementAccount.findFirst({
      where: { isActive: true },
    });
  }

  /**
   * What the settings screen shows (item 30). The account number goes out as
   * its last four digits: enough to say which account it is.
   */
  async state(): Promise<SettlementState> {
    const account = await this.prisma.settlementAccount.findFirst({
      where: { isActive: true },
      select: {
        bankCode: true,
        bankName: true,
        accountName: true,
        accountNumber: true,
        updatedAt: true,
      },
    });
    return {
      account: account
        ? {
            bankCode: account.bankCode,
            bankName: account.bankName,
            accountName: account.accountName,
            accountNumberLast4: account.accountNumber.slice(-4),
            updatedAt: account.updatedAt.toISOString(),
          }
        : null,
      dedicatedPercentage: await this.settings.getPercentage(
        DEDICATED_CONTRACTOR_PERCENTAGE,
      ),
    };
  }

  /** Paystack's banks, by name (Requirement 27.12). */
  async banks(now: number = Date.now()): Promise<PaystackBank[]> {
    if (this.bankCache && now - this.bankCache.fetchedAt < BANK_LIST_TTL_MS) {
      return this.bankCache.banks;
    }
    const banks = (await this.paystack.listBanks()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    this.bankCache = { banks, fetchedAt: now };
    return banks;
  }

  /**
   * Resolves the account name for confirmation before saving — Requirement
   * 27.12 requires the administrator to see it, never type it.
   */
  async resolveAccountName(accountNumber: string, bankCode: string) {
    return this.paystack.resolveAccountNumber(accountNumber, bankCode);
  }

  /**
   * The confirmation step the screen takes before saving (item 30). A lookup
   * turns an account number into a person's name, so it is audited, without
   * the name and with only the last four digits.
   */
  async resolve(input: ResolveSettlementAccountInput): Promise<{ accountName: string }> {
    let resolved: { accountName: string } | null = null;
    try {
      resolved = await this.resolveAccountName(input.accountNumber, input.bankCode);
    } catch {
      resolved = null;
    }
    await this.audit.record({
      action: 'payment.settlement.resolve',
      subjectType: 'settlement_account',
      actorUserId: input.actorUserId,
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      after: {
        bankCode: input.bankCode,
        accountNumberLast4: input.accountNumber.slice(-4),
        outcome: resolved ? 'RESOLVED' : 'NOT_RESOLVED',
      },
    });
    if (!resolved) {
      throw new ValidationException([
        {
          field: 'accountNumber',
          message: 'Paystack could not find this account at that bank.',
        },
      ]);
    }
    return resolved;
  }

  /**
   * Creates the subaccount on the first call, or updates the SAME
   * subaccount's bank details on every later call. Never creates a second
   * subaccount — that would strand dedicated accounts and payment links
   * already settling to the first one.
   */
  async set(input: SetSettlementAccountInput): Promise<SettlementState> {
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
      throw new ValidationException([
        {
          field: 'accountNumber',
          message: 'Paystack could not find this account at that bank. No change was made.',
        },
      ]);
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

    // The state, never the row: the row carries the whole account number and
    // the subaccount code, which no screen needs back.
    return this.state();
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
      throw new ValidationException([
        {
          field: 'percentage',
          message: 'Add the NURTW settlement account before setting its percentage.',
        },
      ]);
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
      throw new ValidationException([
        {
          field: 'percentage',
          message: 'Paystack did not accept the percentage. No change was made.',
        },
      ]);
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
