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
} from '@nestjs/common';
import {
  createInvitationSchema,
  withdrawInvitationSchema,
  type CreateInvitationInput,
  type InvitationList,
  type InvitationSummary,
  type WithdrawInvitationInput,
} from '@nurtw/contracts';

import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Documented } from '../docs/documented.decorator.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import { InvitationService } from './invitation.service.js';

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
 * Inviting an organisation to apply (PRD Requirement 12.11, revision 1.10;
 * EXT-21 — item 33). Reading needs `api_client.read`; inviting and withdrawing
 * need `api_client.manage`, the permission that decides applications.
 */
@Controller('organisation-invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationService) {}

  @RequirePermission('api_client.read')
  @Get()
  @Documented({
    summary: 'The invitations sent, newest first.',
    description:
      'Each with its link’s code, who sent it, and whether it is open, used, expired, or ' +
      'withdrawn, worked out from its dates. The 200 most recent.',
  })
  list(): Promise<InvitationList> {
    return this.invitations.list();
  }

  @RequirePermission('api_client.manage')
  @Post()
  @Documented({
    summary: 'Invite an organisation to apply.',
    description:
      'Makes a link to the application form, addressed to the organisation named. It is used ' +
      'once and lasts `portal.invitation_expiry_days` (14 unless changed). It confirms nobody ' +
      'and lifts no limit: the application it produces is confirmed by telephone or letter and ' +
      'decided as any other. Audited as `portal_invitation.create`, without the code.',
    body: createInvitationSchema,
  })
  create(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createInvitationSchema))
    body: CreateInvitationInput,
  ): Promise<InvitationSummary> {
    return this.invitations.create(actorOf(request), body);
  }

  @RequirePermission('api_client.manage')
  @Post(':id/withdrawal')
  @HttpCode(200)
  @Documented({
    summary: 'Withdraw an open invitation.',
    description:
      'Its link stops working at once. Needs a reason. A used, expired, or already withdrawn ' +
      'invitation answers 409. Audited as `portal_invitation.withdraw`.',
    body: withdrawInvitationSchema,
    responses: { 409: 'Only an open invitation can be withdrawn.' },
  })
  withdraw(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(withdrawInvitationSchema))
    body: WithdrawInvitationInput,
  ): Promise<InvitationSummary> {
    return this.invitations.withdraw(actorOf(request), id, body.reason);
  }
}
