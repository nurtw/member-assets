import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  approveApiClientSchema,
  registerApiClientSchema,
  revokeApiTokenSchema,
  rotateApiTokenSchema,
  setApiClientAccessSchema,
  setApiClientStatusSchema,
  updateApiClientSchema,
  type ApproveApiClientInput,
  type RegisterApiClientInput,
  type RevokeApiTokenInput,
  type RotateApiTokenInput,
  type SetApiClientAccessInput,
  type SetApiClientStatusInput,
  type UpdateApiClientInput,
} from '@nurtw/contracts';

import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Documented } from '../docs/documented.decorator.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import { ApiClientService } from './api-client.service.js';
import { ApiTokenService } from './api-token.service.js';

/**
 * External organisations, their access, and their tokens (PRD §12.1 —
 * item 11).
 *
 * These are **officer** routes, behind a session and a permission. No route
 * here is reachable with an API token, and nothing here is ever sent to the
 * organisation itself except its token, once, by the officer who created it.
 *
 * Union-wide, like master data: an API client belongs to no branch, so the
 * guard's permission check is the whole check.
 */
@Controller('api-clients')
export class ApiClientsController {
  constructor(
    private readonly clients: ApiClientService,
    private readonly tokens: ApiTokenService,
  ) {}

  @RequirePermission('api_client.read')
  @Get()
  @Documented({
    summary: 'List external organisations.',
    description:
      'Each organisation with its status, disclosure profile, scopes, and the token in ' +
      'use. A status of EXPIRED is worked out, not stored: the organisation’s token has run ' +
      'out and nothing has replaced it. `expiringSoon` marks a token inside the reminder ' +
      'window of `reminderDays` (PRD Requirement 12.6). No response carries a token.',
  })
  async list() {
    return this.clients.list();
  }

  @RequirePermission('api_client.read')
  @Get('profiles')
  @Documented({
    summary: 'List the disclosure profiles an organisation can be given.',
    description:
      'The profiles currently offered, each with the fields it permits, for the approval ' +
      'form. Served under `api_client.read` so that an officer who approves organisations ' +
      'can see what each profile would disclose without holding the permission to read ' +
      'every profile.',
  })
  async profiles() {
    return { profiles: await this.clients.assignableProfiles() };
  }

  @RequirePermission('api_client.manage')
  @Post()
  @Documented({
    summary: 'Register an external organisation, pending approval.',
    description:
      'PRD §12.1. Records the organisation, its purpose, its technical contact, and any ' +
      'source-address ranges it will call from. A registration is always PENDING and can do ' +
      'nothing: a status, a scope, or a profile sent here is discarded. Approval is a ' +
      'separate act.',
    body: registerApiClientSchema,
  })
  async register(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(registerApiClientSchema))
    body: RegisterApiClientInput,
  ) {
    return { client: await this.clients.register(this.actor(request), body) };
  }

  @RequirePermission('api_client.read')
  @Get(':id')
  @Documented({
    summary: 'Read one external organisation.',
    description:
      'The whole record: the approval, the agreement, the allowed source ranges, and every ' +
      'token ever issued, by prefix and state. A token’s prefix identifies it and ' +
      'authenticates nothing.',
    responses: { 404: 'No such organisation.' },
  })
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return { client: await this.clients.get(id) };
  }

  @RequirePermission('api_client.manage')
  @Patch(':id')
  @Documented({
    summary: 'Amend an organisation’s record.',
    description:
      'The name, the purpose, the technical contact, the allowed source ranges, and the ' +
      'agreement. A reason is mandatory and the change is audited before and after. This ' +
      'route cannot change what the organisation may do: a scope, a profile, or a status ' +
      'sent here is discarded. An empty list of ranges allows any address.',
    body: updateApiClientSchema,
    responses: {
      404: 'No such organisation.',
      409: 'The organisation’s access has been revoked, and its record is closed.',
    },
  })
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateApiClientSchema))
    body: UpdateApiClientInput,
  ) {
    return { client: await this.clients.update(this.actor(request), id, body) };
  }

  @RequirePermission('api_client.manage')
  @Post(':id/approve')
  @Documented({
    summary: 'Approve a pending organisation.',
    description:
      'PRD §23.11 and Requirements 12.8–12.9. Assigns the disclosure profile and the scopes, ' +
      'and records the data-sharing agreement, the approving officer, and the time. An ' +
      'agreement reference and date are required: no credential is issued for an ' +
      'organisation without one on record. Only a scope in the catalogue can be granted ' +
      '(Requirement 12.4). Approval issues no token.',
    body: approveApiClientSchema,
    responses: {
      404: 'No such organisation, or no such profile.',
      409: 'The organisation is not pending, or the profile is no longer offered.',
    },
  })
  async approve(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(approveApiClientSchema))
    body: ApproveApiClientInput,
  ) {
    return {
      client: await this.clients.approve(this.actor(request), id, body),
    };
  }

  @RequirePermission('api_client.manage')
  @Put(':id/access')
  @Documented({
    summary: 'Replace an approved organisation’s profile and scopes.',
    description:
      'PRD §23.11 — amendable without a deployment. A reason is mandatory and the change is ' +
      'audited before and after. It applies on the organisation’s next request.',
    body: setApiClientAccessSchema,
    responses: {
      404: 'No such organisation, or no such profile.',
      409: 'The organisation is pending or revoked, or the profile is no longer offered.',
    },
  })
  async setAccess(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setApiClientAccessSchema))
    body: SetApiClientAccessInput,
  ) {
    return {
      client: await this.clients.setAccess(this.actor(request), id, body),
    };
  }

  @RequirePermission('api_client.manage')
  @Post(':id/status')
  @Documented({
    summary: 'Suspend, reinstate, refuse, or revoke an organisation.',
    description:
      'A reason is mandatory. SUSPENDED refuses the organisation’s tokens and leaves them ' +
      'intact, so ACTIVE restores access. REVOKED is final: it withdraws every token in the ' +
      'same transaction, and applied to a pending organisation it is a refusal. Each takes ' +
      'effect on the next request (acceptance criterion 11). A pending organisation is made ' +
      'active by approval, never here.',
    body: setApiClientStatusSchema,
    responses: {
      404: 'No such organisation.',
      409: 'The lifecycle does not allow that change.',
    },
  })
  async setStatus(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setApiClientStatusSchema))
    body: SetApiClientStatusInput,
  ) {
    return {
      client: await this.clients.setStatus(this.actor(request), id, body),
    };
  }

  @RequirePermission('api_token.manage')
  @Post(':id/tokens')
  @Documented({
    summary: 'Issue a token to an approved organisation.',
    description:
      'PRD Requirements 12.1 and 12.6. The response carries the token, and it is the only ' +
      'time the token is ever returned: only its hash is stored. It expires after the ' +
      'number of days in the `api_token.expiry_days` setting (90). Refused while the ' +
      'organisation has a token in use; replace that one by rotating it.',
    responses: {
      404: 'No such organisation.',
      409: 'The organisation is not active, or already has a token in use.',
    },
  })
  async issueToken(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tokens.issue(this.actor(request), id);
  }

  @RequirePermission('api_token.manage')
  @Post(':id/tokens/:tokenId/rotate')
  @Documented({
    summary: 'Replace the token in use.',
    description:
      'PRD Requirement 12.10. Issues a new token for a full term and returns it, once. The ' +
      'token it replaces keeps working for the `overlap` chosen (NONE, ONE_HOUR, ONE_DAY, ' +
      'or SEVEN_DAYS), and never beyond its own expiry, so the organisation can install the ' +
      'new one without an outage. A token that has leaked is revoked instead.',
    body: rotateApiTokenSchema,
    responses: {
      404: 'No such organisation or token.',
      409: 'The organisation is not active, or the token is not the one in use.',
    },
  })
  async rotateToken(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
    @Body(new ZodValidationPipe(rotateApiTokenSchema))
    body: RotateApiTokenInput,
  ) {
    return this.tokens.rotate(this.actor(request), id, tokenId, body);
  }

  @RequirePermission('api_token.manage')
  @Post(':id/tokens/:tokenId/revoke')
  @Documented({
    summary: 'Revoke a token.',
    description:
      'Takes effect on the next request, with no redeployment (acceptance criterion 11). A ' +
      'reason is mandatory. Any token not yet revoked can be: the one in use, or one still ' +
      'running out its overlap after a rotation.',
    body: revokeApiTokenSchema,
    responses: {
      404: 'No such organisation or token.',
      409: 'The token is already revoked.',
    },
  })
  async revokeToken(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
    @Body(new ZodValidationPipe(revokeApiTokenSchema))
    body: RevokeApiTokenInput,
  ) {
    return {
      token: await this.tokens.revoke(this.actor(request), id, tokenId, body),
    };
  }

  private actor(request: AuthenticatedRequest): ActorContext {
    if (!request.user) {
      throw new BadRequestException();
    }
    return {
      userId: request.user.id,
      requestId: request.header('x-request-id') ?? null,
      ipAddress: request.ip ?? null,
    };
  }
}
