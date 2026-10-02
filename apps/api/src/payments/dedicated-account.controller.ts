import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  assignDedicatedAccountSchema,
  type AssignDedicatedAccountInput,
} from '@nurtw/contracts';

import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Documented } from '../docs/documented.decorator.js';
import { DedicatedAccountService } from './dedicated-account.service.js';

/**
 * A member's dedicated account (PRD Requirement 27.7 — item 23). **Internal
 * only**, like dues (Requirement 27.8).
 *
 * Both routes act on one member, so the service re-asks the permission
 * against that member's organisation: holding `payment.initiate` in one
 * branch opens no account for a member of another.
 */
@Controller('members/:id/dedicated-account')
export class DedicatedAccountController {
  constructor(private readonly dedicated: DedicatedAccountService) {}

  @RequirePermission('payment.read')
  @Get()
  @Documented({
    summary: "A member's dedicated account, what it has received, and what to send.",
    description:
      'PRD Requirement 27.7 — the account, if one is assigned; money received into it, each ' +
      'with the dues it paid, oldest first (PAY-12); credit held for the next due; and the ' +
      'whole-naira amount to send for NURTW to receive what is owed, at the contractor ' +
      'percentage. Also says why an account cannot be assigned yet, if it cannot. ' +
      '**Internal only** (Requirement 27.8).',
    responses: { 404: 'No such member, or they lie outside the caller’s scope.' },
  })
  async state(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { dedicatedAccount: await this.dedicated.state(this.userId(request), id) };
  }

  @RequirePermission('payment.initiate')
  @Post()
  @Documented({
    summary: 'Assign a member a Paystack dedicated account.',
    description:
      'PRD Requirement 27.7 — opens a dedicated account split to the NURTW subaccount, so ' +
      'transfers into it settle straight to NURTW (PAY-11). Paystack is sent the email given ' +
      'here and the member’s names and phone, nothing more. Refused while the member is not ' +
      'active, already has an account, has no phone on record, or while the settlement ' +
      'account or the contractor percentage is unset.',
    body: assignDedicatedAccountSchema,
    responses: {
      404: 'No such member, or they lie outside the caller’s scope.',
      409: 'An account cannot be assigned yet; the GET says why.',
      502: 'Paystack did not open the account.',
    },
  })
  async assign(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(assignDedicatedAccountSchema))
    body: AssignDedicatedAccountInput,
  ) {
    return {
      dedicatedAccount: await this.dedicated.assign(this.userId(request), id, body.email),
    };
  }

  private userId(request: AuthenticatedRequest): string {
    const userId = request.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }
    return userId;
  }
}
