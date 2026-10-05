import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  initiatePaymentSchema,
  resolveSettlementAccountSchema,
  setDedicatedPercentageSchema,
  setSettlementAccountSchema,
  type InitiatePaymentInput,
  type PaystackBank,
  type ResolvedSettlementAccount,
  type ResolveSettlementAccountInput,
  type SetDedicatedPercentageInput,
  type SetSettlementAccountInput,
  type SettlementState,
} from '@nurtw/contracts';

import { AuditService } from '../audit/audit.service.js';
import { PasswordService } from '../auth/password.service.js';
import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import { Public, RequirePermission } from '../auth/require-permission.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Documented } from '../docs/documented.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DedicatedAccountService } from './dedicated-account.service.js';
import { PaymentsService } from './payments.service.js';
import { PaystackClient } from './paystack/paystack.client.js';
import { SettlementService, wrongPassword } from './settlement.service.js';

/**
 * Payments (PRD §27). Record-scoped permission checks are not applied here:
 * `payment.initiate` and `payment.manage_settlement` are Union-wide
 * administrative actions, not actions against one branch's records, the
 * same reasoning `MasterDataService` documents for master data.
 */
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly settlement: SettlementService,
    private readonly passwords: PasswordService,
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackClient,
    private readonly audit: AuditService,
    private readonly dedicated: DedicatedAccountService,
  ) {}

  @RequirePermission('payment.initiate')
  @Post('initiate')
  @Documented({
    summary: 'Start a payment for a fee type.',
    description:
      'Computes the processing fee (Requirement 27.3), creates the payment record, and returns ' +
      'a Paystack payment-link URL. A sticker fee always settles wholly to the contractor; a ' +
      'due split with NURTW requires the settlement account to already be configured. If ' +
      'Paystack does not start the payment, the record is closed as failed and the answer is ' +
      '503: nothing was taken, and the caller may try again.',
    body: initiatePaymentSchema,
  })
  async initiate(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(initiatePaymentSchema))
    body: InitiatePaymentInput,
  ) {
    const userId = request.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }
    return this.payments.initiate({
      feeTypeCode: body.feeTypeCode,
      subjectType: body.subjectType,
      subjectId: body.subjectId,
      payerEmail: body.payerEmail,
      callbackUrl: body.callbackUrl,
      initiatedByUserId: userId,
    });
  }

  /**
   * Called by Paystack, never by a browser session — hence `@Public()`.
   * The ONLY authentication here is the HMAC signature over the raw body
   * (Requirement 27.5); an invalid signature is refused before any
   * database access, matching the rule CLAUDE.md states for QR payloads.
   */
  @Public()
  @Post('webhook')
  @Documented({
    summary: "Paystack's transaction webhook.",
    description:
      'Verified by HMAC-SHA512 over the raw body against `x-paystack-signature`. Confirmation ' +
      'still re-verifies the transaction with Paystack directly (Requirement 27.5) rather than ' +
      'trusting this payload alone.',
  })
  async webhook(@Req() request: AuthenticatedRequest & { rawBody?: Buffer }) {
    const signature = request.header('x-paystack-signature');
    if (
      !request.rawBody ||
      !this.paystack.verifyWebhookSignature(request.rawBody, signature)
    ) {
      throw new UnauthorizedException();
    }

    const body = request.body as {
      event?: string;
      data?: { reference?: string; channel?: string };
    };
    if (body?.event === 'charge.success' && body.data?.reference) {
      // A transfer into a dedicated account carries a reference Paystack made
      // up, not one the System issued, so it has no payment to confirm. The
      // channel only routes it: `receive` re-verifies it with Paystack.
      if (body.data.channel === 'dedicated_nuban') {
        await this.dedicated.receive(body.data.reference);
      } else {
        await this.payments.confirm(body.data.reference);
      }
    }
    return { received: true };
  }

  @RequirePermission('payment.manage_settlement')
  @Get('settlement')
  @Documented({
    summary: 'The NURTW settlement account and the dedicated-account percentage.',
    description:
      'What the settings screen shows (item 30): the bank, the account name Paystack holds, the ' +
      'last four digits of the account number, and the contractor percentage of ' +
      'dedicated-account money (PAY-11). The whole account number is never returned.',
  })
  settlementState(): Promise<SettlementState> {
    return this.settlement.state();
  }

  @RequirePermission('payment.manage_settlement')
  @Get('banks')
  @Documented({
    summary: "Paystack's list of banks.",
    description:
      'Requirement 27.12: the settlement bank is chosen from this list, never typed. Active ' +
      'Nigerian banks, by name, read from Paystack and kept for an hour.',
  })
  async banks(): Promise<{ banks: PaystackBank[] }> {
    return { banks: await this.settlement.banks() };
  }

  @RequirePermission('payment.manage_settlement')
  @Post('settlement/resolve')
  @HttpCode(200)
  @Documented({
    summary: 'Look up the name Paystack holds for an account.',
    description:
      'Requirement 27.12: the account name is shown for confirmation before anything is saved. ' +
      'Nothing is saved here. Audited, with the last four digits and without the name. An ' +
      'account Paystack cannot find answers 400 naming `accountNumber`.',
    body: resolveSettlementAccountSchema,
  })
  resolveSettlementAccount(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(resolveSettlementAccountSchema))
    body: ResolveSettlementAccountInput,
  ): Promise<ResolvedSettlementAccount> {
    const userId = request.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }
    return this.settlement.resolve({
      bankCode: body.bankCode,
      accountNumber: body.accountNumber,
      actorUserId: userId,
      ipAddress: request.ip,
      requestId: request.header('x-request-id'),
    });
  }

  @RequirePermission('payment.manage_settlement')
  @Post('settlement')
  @Documented({
    summary: 'Add or change the NURTW settlement account.',
    description:
      'Requires password re-entry (Requirement 27.12, PAY-13). No second approver — the control ' +
      'is the audit trail, which records this attempt whether it succeeds or fails. The first ' +
      'save creates the Paystack subaccount; every later save updates that same subaccount. ' +
      'Answers with the settlement state. A wrong password answers 400 naming `password`; an ' +
      'account Paystack cannot find, 400 naming `accountNumber`.',
    body: setSettlementAccountSchema,
  })
  async setSettlementAccount(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(setSettlementAccountSchema))
    body: SetSettlementAccountInput,
  ): Promise<SettlementState> {
    const userId = request.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const passwordOk =
      !!user && (await this.passwords.verify(body.password, user.passwordHash));
    if (!passwordOk) {
      // Failed attempts are audited too (PAY-13) — a wrong password never
      // reaches SettlementService, so it is recorded here instead.
      await this.audit.record({
        action: 'payment.settlement.update',
        subjectType: 'settlement_account',
        actorUserId: userId,
        reason: body.reason,
        ipAddress: request.ip,
        requestId: request.header('x-request-id'),
        after: { outcome: 'REJECTED_WRONG_PASSWORD' },
      });
      throw wrongPassword();
    }

    return this.settlement.set({
      bankCode: body.bankCode,
      bankName: body.bankName,
      accountNumber: body.accountNumber,
      actorUserId: userId,
      reason: body.reason,
      ipAddress: request.ip,
      requestId: request.header('x-request-id'),
    });
  }

  @RequirePermission('payment.manage_settlement')
  @Put('settlement/dedicated-percentage')
  @Documented({
    summary: "Set the contractor's percentage of dedicated-account money.",
    description:
      'PRD Requirement 27.7, PAY-11 — Paystack applies the NURTW subaccount’s fixed percentage ' +
      'to every transfer into a dedicated account; this sets it, at Paystack first and then in ' +
      'settings. Payment links are unaffected: each carries its own split (Requirement 27.4). ' +
      'Guarded like the settlement account: password re-entry, a mandatory reason, and an ' +
      'audit entry whether it succeeds or fails. A wrong password answers 400 naming ' +
      '`password`; no settlement account, or a refusal by Paystack, 400 naming `percentage`.',
    body: setDedicatedPercentageSchema,
  })
  async setDedicatedPercentage(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(setDedicatedPercentageSchema))
    body: SetDedicatedPercentageInput,
  ) {
    const userId = request.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const passwordOk =
      !!user && (await this.passwords.verify(body.password, user.passwordHash));
    if (!passwordOk) {
      await this.audit.record({
        action: 'payment.settlement.dedicated_percentage',
        subjectType: 'settlement_account',
        actorUserId: userId,
        reason: body.reason,
        ipAddress: request.ip,
        requestId: request.header('x-request-id'),
        after: { percentage: body.percentage, outcome: 'REJECTED_WRONG_PASSWORD' },
      });
      throw wrongPassword();
    }

    return this.settlement.setDedicatedPercentage({
      percentage: body.percentage,
      actorUserId: userId,
      reason: body.reason,
      ipAddress: request.ip,
      requestId: request.header('x-request-id'),
    });
  }
}
