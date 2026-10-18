import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  sendTestSmsSchema,
  smsTemplateKeySchema,
  updateSmsSettingsSchema,
  updateSmsTemplateSchema,
  type SendTestSmsInput,
  type UpdateSmsSettingsInput,
  type UpdateSmsTemplateInput,
} from '@nurtw/contracts';
import type { SmsTemplateKey } from '@nurtw/domain';

import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import {
  Public,
  RequirePermission,
} from '../auth/require-permission.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Documented } from '../docs/documented.decorator.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import { SmsService } from './sms.service.js';

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
 * Text messages: the switch, the words, a test message, and the provider's
 * delivery reports (item 45). Union-wide settings, so `system_setting.manage`
 * anywhere is the whole check.
 */
@Controller('notifications/sms')
export class SmsController {
  constructor(private readonly sms: SmsService) {}

  @RequirePermission('system_setting.manage')
  @Get()
  @Documented({
    summary:
      'Text messages: the switch, the sender name, the route, and the words.',
    description:
      'Item 45 (PRD Requirement 27.14). Says whether each part of the provider’s configuration ' +
      'is present (the API key, the account’s base URL, the delivery-report secret), never ' +
      'its value.',
  })
  async state() {
    return { sms: await this.sms.state() };
  }

  @RequirePermission('system_setting.manage')
  @Put('settings')
  @Documented({
    summary:
      'Switch text messages on or off, or change the sender name or route.',
    description:
      'Audited with the reason. Messages cannot be switched on while the provider is not ' +
      'configured. While they are off, confirmations are recorded as not sent, and none is ' +
      'sent later.',
    body: updateSmsSettingsSchema,
    responses: {
      409: 'The provider is not configured, so messages cannot be switched on.',
    },
  })
  async updateSettings(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(updateSmsSettingsSchema))
    body: UpdateSmsSettingsInput,
  ) {
    return { sms: await this.sms.updateSettings(actorOf(request), body) };
  }

  @RequirePermission('system_setting.manage')
  @Put('templates/:key')
  @Documented({
    summary: 'Change the words of one message.',
    description:
      'A new version, audited with the reason; earlier versions are kept. A template may use ' +
      'only {amount}, {member}, {date}, and {owed}, must keep to the SMS alphabet (naira is ' +
      'written N), and must fit in two SMS once filled in.',
    body: updateSmsTemplateSchema,
    responses: { 409: 'The words were changed by someone else a moment ago.' },
  })
  async updateTemplate(
    @Req() request: AuthenticatedRequest,
    @Param('key', new ZodValidationPipe(smsTemplateKeySchema))
    key: SmsTemplateKey,
    @Body(new ZodValidationPipe(updateSmsTemplateSchema))
    body: UpdateSmsTemplateInput,
  ) {
    return { sms: await this.sms.updateTemplate(actorOf(request), key, body) };
  }

  @RequirePermission('system_setting.manage')
  @Post('test')
  @Documented({
    summary: 'Send one test message to a number.',
    description:
      'Sent at once, whether or not messages are switched on, to prove the key, the sender ' +
      'name, and the route. Fixed words. Recorded and audited with the last four digits of ' +
      'the number only.',
    body: sendTestSmsSchema,
    responses: { 503: 'The provider is not configured.' },
  })
  async sendTest(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(sendTestSmsSchema)) body: SendTestSmsInput,
  ) {
    return { message: await this.sms.sendTest(actorOf(request), body.phone) };
  }

  /**
   * Called by Termii, never by a browser session — hence `@Public()`. The
   * only authentication is the signature over the raw body, checked before
   * any database access.
   */
  @Public()
  @Post('delivery')
  @HttpCode(200)
  @Documented({
    summary: "Termii's delivery reports.",
    description:
      'Verified by HMAC-SHA512 over the raw body against `X-Termii-Signature`, under the ' +
      'secret key. Updates the message the report names; an unknown message is ignored.',
    responses: { 401: 'The signature is missing or wrong.' },
  })
  async delivery(@Req() request: AuthenticatedRequest & { rawBody?: Buffer }) {
    if (
      !request.rawBody ||
      !this.sms.verifyDelivery(
        request.rawBody,
        request.header('x-termii-signature'),
      )
    ) {
      throw new UnauthorizedException();
    }
    await this.sms.recordDelivery(
      (request.body ?? {}) as Record<string, unknown>,
    );
    return { received: true };
  }
}

/**
 * The messages sent to one member (item 45). Internal, like dues
 * (Requirement 27.8): each route re-asks its permission over the member's own
 * organisation, and answers 404 out of scope.
 */
@Controller('members/:id/messages')
export class MemberMessagesController {
  constructor(private readonly sms: SmsService) {}

  @RequirePermission('payment.read')
  @Get()
  @Documented({
    summary: 'The text messages sent to a member.',
    description:
      'The latest 20: what each was for, its status, and what it said. Only the last four ' +
      'digits of the number it went to. **Internal only** (Requirement 27.8).',
    responses: {
      404: 'No such member, or they lie outside the caller’s scope.',
    },
  })
  async list(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (!request.user) {
      throw new UnauthorizedException();
    }
    return await this.sms.listForMember(request.user.id, id);
  }

  @RequirePermission('payment.initiate')
  @Post(':messageId/resend')
  @Documented({
    summary: 'Send a payment confirmation again.',
    description:
      'Made up afresh from what is true now, and audited. Refused while messages are switched ' +
      'off.',
    responses: {
      404: 'No such member or message, or the member lies outside the caller’s scope.',
      409: 'Messages are switched off.',
    },
  })
  async resend(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ) {
    return { message: await this.sms.resend(actorOf(request), id, messageId) };
  }
}
