import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  initiatePaymentSchema,
  setSettlementAccountSchema,
  type InitiatePaymentInput,
  type SetSettlementAccountInput,
} from '@nurtw/contracts';

import { AuditService } from '../audit/audit.service.js';
import { PasswordService } from '../auth/password.service.js';
import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import { Public, RequirePermission } from '../auth/require-permission.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Documented } from '../docs/documented.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaymentsService } from './payments.service.js';
import { PaystackClient } from './paystack/paystack.client.js';
import { SettlementService } from './settlement.service.js';

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
  ) {}

  @RequirePermission('payment.initiate')
  @Post('initiate')
  @Documented({
    summary: 'Start a payment for a fee type.',
    description:
      'Computes the processing fee (Requirement 27.3), creates the payment record, and returns ' +
      'a Paystack payment-link URL. A sticker fee always settles wholly to the contractor; a ' +
      'due split with NURTW requires the settlement account to already be configured.',
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
      data?: { reference?: string };
    };
    if (body?.event === 'charge.success' && body.data?.reference) {
      await this.payments.confirm(body.data.reference);
    }
    return { received: true };
  }

  @RequirePermission('payment.manage_settlement')
  @Post('settlement')
  @Documented({
    summary: 'Add or change the NURTW settlement account.',
    description:
      'Requires password re-entry (Requirement 27.12, PAY-13). No second approver — the control ' +
      'is the audit trail, which records this attempt whether it succeeds or fails. The first ' +
      'save creates the Paystack subaccount; every later save updates that same subaccount.',
    body: setSettlementAccountSchema,
  })
  async setSettlementAccount(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(setSettlementAccountSchema))
    body: SetSettlementAccountInput,
  ) {
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
      throw new BadRequestException('Incorrect password.');
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
}
