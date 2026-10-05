import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  payLinkSubjectSchema,
  publicPaySchema,
  replacePayLinkSchema,
  type PayLinkSubjectInput,
  type PayLinkSummary,
  type PublicPayInput,
  type PublicPayPage,
  type PublicPayStarted,
  type ReplacePayLinkInput,
} from '@nurtw/contracts';
import type { Response } from 'express';

import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import {
  Public,
  RequirePermission,
} from '../auth/require-permission.decorator.js';
import { PublicRateLimitedException } from '../common/public-rate-limit.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Documented } from '../docs/documented.decorator.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import { PayLinkService } from './pay-link.service.js';

function actorOf(request: AuthenticatedRequest): ActorContext {
  if (!request.user) {
    throw new BadRequestException();
  }
  return {
    userId: request.user.id,
    requestId: request.header('x-request-id') ?? null,
    ipAddress: request.ip ?? null,
  };
}

/**
 * A subject's personal pay link, for the officer who sends it (PRD Requirement
 * 27.8, revision 1.9; PAY-21 — item 31). `payment.initiate` over the
 * subject's organisation; out of scope answers 404.
 */
@Controller('pay-links')
export class PayLinksController {
  constructor(private readonly payLinks: PayLinkService) {}

  @RequirePermission('payment.initiate')
  @Post()
  @HttpCode(200)
  @Documented({
    summary: "A vehicle's or member's pay link, made if it has none.",
    description:
      'The link opens the public page `/pay/{code}` on the web application, offering the ' +
      'published levy (a vehicle) or yearly fee (a member) and never what is owed. Asking ' +
      'again returns the same link. Needs `payment.initiate` over the subject; out of scope ' +
      'answers 404. Audited as `pay_link.create`.',
    body: payLinkSubjectSchema,
  })
  forSubject(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(payLinkSubjectSchema))
    body: PayLinkSubjectInput,
  ): Promise<PayLinkSummary> {
    return this.payLinks.forSubject(actorOf(request), body);
  }

  @RequirePermission('payment.initiate')
  @Post(':id/replace')
  @HttpCode(200)
  @Documented({
    summary: 'Replace a pay link.',
    description:
      'The old link stops working at once and is kept, with who replaced it and why. For a ' +
      'link sent to the wrong person, or misused. Audited as `pay_link.replace`.',
    body: replacePayLinkSchema,
  })
  replace(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(replacePayLinkSchema))
    body: ReplacePayLinkInput,
  ): Promise<PayLinkSummary> {
    return this.payLinks.replace(actorOf(request), id, body.reason);
  }
}

/**
 * The public pay page's routes (item 31). Public by design: holding a pay
 * link is what lets a payer pay. They read no dues, so no answer says what is
 * owed or paid (Requirement 27.8). Limited per address; a limit answers 429
 * with `Retry-After`.
 */
@Controller('pay')
export class PublicPayController {
  constructor(private readonly payLinks: PayLinkService) {}

  @Public()
  @Get(':code')
  @Documented({
    summary: 'What a pay link offers.',
    description:
      'The subject (a plate, or a first name and membership number) and the published ' +
      'amounts, with the fee on top. The same for every subject of a kind, whatever it ' +
      'owes. An unknown or replaced code answers 404.',
  })
  async page(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('code') code: string,
  ): Promise<PublicPayPage> {
    return withRetryAfter(response, () =>
      this.payLinks.publicPage(code, request.ip),
    );
  }

  @Public()
  @Post(':code')
  @HttpCode(200)
  @Documented({
    summary: 'Start a payment from a pay link.',
    description:
      'Answers the Paystack page to send the payer to. The return address, if given, must be ' +
      'on the web application. The due is credited only once Paystack confirms the payment, ' +
      'like any other (Requirement 27.5). No officer is recorded.',
    body: publicPaySchema,
  })
  async start(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('code') code: string,
    @Body(new ZodValidationPipe(publicPaySchema)) body: PublicPayInput,
  ): Promise<PublicPayStarted> {
    return withRetryAfter(response, () =>
      this.payLinks.publicStart(
        code,
        body,
        request.ip,
        request.header('x-request-id'),
      ),
    );
  }
}

async function withRetryAfter<T>(
  response: Response,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof PublicRateLimitedException) {
      response.setHeader('Retry-After', String(error.retryAfterSeconds));
    }
    throw error;
  }
}
