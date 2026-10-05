import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  createPortalAccountSchema,
  portalApplicationSchema,
  portalChangePasswordSchema,
  portalLoginSchema,
  resetPortalPasswordSchema,
  revokeApiTokenSchema,
  rotateApiTokenSchema,
  type ApiTokenSummary,
  type CreatePortalAccountInput,
  type IssuedApiToken,
  type IssuedPortalPassword,
  type PortalApplicationInput,
  type PortalApplicationReceived,
  type PortalChangePasswordInput,
  type PortalLoginInput,
  type PortalMe,
  type PortalTokens,
  type PortalUsage,
  type ResetPortalPasswordInput,
  type RevokeApiTokenInput,
  type RotateApiTokenInput,
} from '@nurtw/contracts';
import type { Request, Response } from 'express';

import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import {
  Public,
  RequirePermission,
} from '../auth/require-permission.decorator.js';
import { PublicRateLimitedException } from '../common/public-rate-limit.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Documented } from '../docs/documented.decorator.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import {
  PORTAL_COOKIE_NAME,
  PortalAccount,
  type PortalPrincipal,
  type PortalRequest,
} from './portal-account.decorator.js';
import { PORTAL_USAGE_DEFAULT_DAYS, PortalService } from './portal.service.js';

function principalOf(request: PortalRequest): PortalPrincipal {
  if (!request.portalAccount) {
    // The guard sets it on every portal route; its absence is a wiring fault.
    throw new UnauthorizedException();
  }
  return request.portalAccount;
}

function contextOf(request: Request) {
  return {
    ipAddress: request.ip,
    requestId: request.header('x-request-id'),
  };
}

function portalCookie(request: Request): string | null {
  const value = request.headers.cookie
    ?.split(';')
    .map((part) => part.trim().split('='))
    .find(([name]) => name === PORTAL_COOKIE_NAME)?.[1];
  return value ? decodeURIComponent(value) : null;
}

/**
 * The organisation portal (PRD §23.23, revision 1.9; EXT-20 — item 29).
 *
 * Applying and signing in are public. Everything else carries
 * `@PortalAccount()`: the portal's own session, which reaches these routes
 * and no others. No route here takes an organisation's id from the caller;
 * each acts on the organisation the session belongs to.
 */
@Controller('portal')
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Public()
  @Post('applications')
  @HttpCode(200)
  @Documented({
    summary: 'Apply for access, as an outside organisation.',
    description:
      'Creates a pending organisation and its portal account. It can do nothing until the API ' +
      'administrator approves it, having confirmed the applicant by telephone or letter. The ' +
      'answer is the same for every application, so the form does not say which addresses ' +
      'already hold an account. Limited per address; a limit, or a full waiting list, answers ' +
      '429 with `Retry-After`. An unapproved application lapses after 30 days.',
    body: portalApplicationSchema,
  })
  async apply(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body(new ZodValidationPipe(portalApplicationSchema))
    body: PortalApplicationInput,
  ): Promise<PortalApplicationReceived> {
    try {
      return await this.portal.apply(body, contextOf(request));
    } catch (error) {
      if (error instanceof PublicRateLimitedException) {
        response.setHeader('Retry-After', String(error.retryAfterSeconds));
      }
      throw error;
    }
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @Documented({
    summary: 'Sign in to the organisation portal.',
    description:
      'Sets the portal session as an `httpOnly` cookie of its own, never the officers’ ' +
      'cookie. An unknown address, a wrong password, and a locked account answer the same ' +
      '401. Repeated failures lock the account for a time.',
    body: portalLoginSchema,
  })
  async login(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body(new ZodValidationPipe(portalLoginSchema)) body: PortalLoginInput,
  ): Promise<{ status: 'ok' }> {
    const session = await this.portal.login(body.email, body.password, {
      ipAddress: request.ip,
      userAgent: request.header('user-agent'),
    });
    response.cookie(PORTAL_COOKIE_NAME, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: session.expiresAt,
      path: '/',
    });
    return { status: 'ok' };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  @Documented({
    summary: 'Sign out of the organisation portal.',
    description:
      'Answers 200 whether or not a valid portal session was presented.',
  })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ status: 'ok' }> {
    const token = portalCookie(request);
    if (token) {
      await this.portal.logout(token);
    }
    response.clearCookie(PORTAL_COOKIE_NAME, { path: '/' });
    return { status: 'ok' };
  }

  @PortalAccount('OWN')
  @Get('me')
  @Documented({
    summary: 'The signed-in portal account and where its organisation stands.',
    description:
      'Its status, scopes, what its answers may carry, and its limits. It shows that requests ' +
      'are paused and until when, never why. Open on a temporary password.',
  })
  me(@Req() request: PortalRequest): Promise<PortalMe> {
    return this.portal.me(principalOf(request));
  }

  @PortalAccount('OWN')
  @Post('password')
  @HttpCode(200)
  @Documented({
    summary: 'Change the portal account’s own password.',
    description:
      'Signs out every other session of the account. A wrong current password answers 400 ' +
      'naming `currentPassword`.',
    body: portalChangePasswordSchema,
  })
  async changePassword(
    @Req() request: PortalRequest,
    @Body(new ZodValidationPipe(portalChangePasswordSchema))
    body: PortalChangePasswordInput,
  ): Promise<{ status: 'ok' }> {
    await this.portal.changePassword(
      principalOf(request),
      body,
      contextOf(request),
    );
    return { status: 'ok' };
  }

  @PortalAccount()
  @Get('usage')
  @Documented({
    summary: 'The organisation’s own requests, by day.',
    description:
      'Counts only, by Lagos day, in the terms the API itself answered in: a forged code is ' +
      'counted with every other non-match, and a refusal carries no reason. No identifier ' +
      'that was looked up is held or shown.',
    query: [
      {
        name: 'days',
        description: 'How many days back, up to 90. Thirty if left out.',
      },
    ],
  })
  usage(
    @Req() request: PortalRequest,
    @Query('days') days?: string,
  ): Promise<PortalUsage> {
    const asked = days === undefined ? PORTAL_USAGE_DEFAULT_DAYS : Number(days);
    if (!Number.isInteger(asked) || asked < 1) {
      throw new BadRequestException();
    }
    return this.portal.usage(principalOf(request), asked);
  }

  @PortalAccount()
  @Get('tokens')
  @Documented({
    summary: 'The organisation’s own tokens.',
    description: 'Prefixes, dates, and states. Never a token or its hash.',
  })
  tokens(@Req() request: PortalRequest): Promise<PortalTokens> {
    return this.portal.listTokens(principalOf(request));
  }

  @PortalAccount()
  @Post('tokens')
  @Documented({
    summary: 'Issue the organisation’s token.',
    description:
      'Only for an approved, active organisation with no token in use. The token is returned ' +
      'once, here, to the organisation alone: no Union officer sees it. Its scopes, profile, ' +
      'and limits are the administrator’s to set.',
  })
  issueToken(@Req() request: PortalRequest): Promise<IssuedApiToken> {
    return this.portal.issueToken(principalOf(request), contextOf(request));
  }

  @PortalAccount()
  @Post('tokens/:tokenId/rotate')
  @Documented({
    summary: 'Replace the organisation’s token.',
    description:
      'The new token is returned once. The old one keeps working for the overlap chosen, and ' +
      'never past its own expiry.',
    body: rotateApiTokenSchema,
  })
  rotateToken(
    @Req() request: PortalRequest,
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
    @Body(new ZodValidationPipe(rotateApiTokenSchema))
    body: RotateApiTokenInput,
  ): Promise<IssuedApiToken> {
    return this.portal.rotateToken(
      principalOf(request),
      tokenId,
      body,
      contextOf(request),
    );
  }

  @PortalAccount()
  @Post('tokens/:tokenId/revoke')
  @HttpCode(200)
  @Documented({
    summary: 'Revoke one of the organisation’s tokens, at once.',
    description:
      'For a token that may have leaked. Possible whatever the organisation’s status. A token ' +
      'of another organisation answers 404.',
    body: revokeApiTokenSchema,
  })
  revokeToken(
    @Req() request: PortalRequest,
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
    @Body(new ZodValidationPipe(revokeApiTokenSchema))
    body: RevokeApiTokenInput,
  ): Promise<ApiTokenSummary> {
    return this.portal.revokeToken(
      principalOf(request),
      tokenId,
      body,
      contextOf(request),
    );
  }
}

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
 * An organisation's portal account, as the API administrator manages it
 * (item 29). The password is always one the System generated, shown once.
 */
@Controller('api-clients/:id/portal-account')
export class PortalAccountsController {
  constructor(private readonly portal: PortalService) {}

  @RequirePermission('api_client.manage')
  @Post()
  @Documented({
    summary: 'Give an organisation its portal account.',
    description:
      'For an organisation an officer registered. One account per organisation. The System ' +
      'generates a temporary password, returned once here; the organisation must change it at ' +
      'first sign-in. Audited as `portal_account.create`.',
    body: createPortalAccountSchema,
  })
  create(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createPortalAccountSchema))
    body: CreatePortalAccountInput,
  ): Promise<IssuedPortalPassword> {
    return this.portal.createAccount(actorOf(request), id, body);
  }

  @RequirePermission('api_client.manage')
  @Post('reset-password')
  @HttpCode(200)
  @Documented({
    summary: 'Reset an organisation’s portal password.',
    description:
      'Returns a new temporary password once, signs the account out everywhere, and lifts any ' +
      'lock. Needs a reason. Audited as `portal_account.password_reset`.',
    body: resetPortalPasswordSchema,
  })
  resetPassword(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(resetPortalPasswordSchema))
    body: ResetPortalPasswordInput,
  ): Promise<IssuedPortalPassword> {
    return this.portal.resetPassword(actorOf(request), id, body.reason);
  }
}
