import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  changePasswordSchema,
  loginSchema,
  secondFactorSchema,
  type ChangePasswordInput,
  type LoginInput,
  type SecondFactorInput,
} from '@nurtw/contracts';
import type { Response } from 'express';

import { Documented } from '../docs/documented.decorator.js';
import { AccountService } from './account.service.js';
import { AuthService } from './auth.service.js';
import {
  SESSION_COOKIE_NAME,
  type AuthenticatedRequest,
} from './authorisation.guard.js';
import { PermissionService } from './permission.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  Public,
  RequirePermission,
  SignedIn,
} from './require-permission.decorator.js';
import type { SessionUser } from './session.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly account: AccountService,
    private readonly permissions: PermissionService,
  ) {}

  /**
   * The session cookie.
   *
   * `httpOnly` so script cannot read it — the single most effective mitigation
   * against a stolen session via XSS. `secure` outside development, since a
   * cookie without it also travels over plain HTTP.
   *
   * `sameSite: 'lax'`, not `'none'`. This API (Render) and the web application
   * (Vercel) are genuinely different domains, but the browser never talks to
   * this one directly: `apps/web/next.config.ts` rewrites `/api/v1/*` to here
   * server-side, so every browser request targets the web app's own origin and
   * this cookie is set, and read back, as first-party. `'none'` used to be
   * required for exactly the opposite reason, and it was the cause of a real
   * bug: a browser blocking third-party cookies by default (Chrome's ongoing
   * rollout; Firefox and Safari's tracking protections do the same) silently
   * dropped it — login would succeed, the very next request would look
   * unauthenticated, and the officer was bounced back to the login screen with
   * no error at all.
   */
  private cookieOptions(expiresAt: Date) {
    const isProduction = process.env.NODE_ENV === 'production';
    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax' as const,
      expires: expiresAt,
      path: '/',
    };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Documented({
    summary: 'Open a session.',
    description:
      'On success an opaque session token is set as an `httpOnly` cookie and is never returned ' +
      'in the body, so it cannot be recovered from a logged response or an XHR trace. ' +
      'An unknown account and an incorrect password produce byte-identical responses, and both ' +
      'take comparable time, so neither existence nor near-misses can be inferred. Where the ' +
      'account has a second factor, `code` carries the authenticator code or a recovery code; ' +
      'once the password is accepted, a missing or wrong code answers 401 naming the `code` ' +
      'field. Ten failed sign-ins in a row lock the account for fifteen minutes.',
    body: loginSchema,
    responses: {
      401: 'The credentials were not accepted, or the second factor is needed.',
      503: 'The account has a second factor, and it cannot be checked at present.',
    },
  })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ status: 'ok' }> {
    const { email, password, code } = body;

    const session = await this.auth.login(email, password, code, {
      ipAddress: request.ip,
      userAgent: request.header('user-agent'),
    });

    // The token is delivered only as a cookie, never in the response body, so it
    // cannot be picked up from a logged response or an XHR trace.
    response.cookie(
      SESSION_COOKIE_NAME,
      session.token,
      this.cookieOptions(session.expiresAt),
    );

    return { status: 'ok' };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @Documented({
    summary: 'Close the current session.',
    description:
      'Deletes the session server-side, so revocation takes effect on the **next** request. ' +
      'That property is why sessions were chosen over signed tokens. Answers 200 whether or ' +
      'not a valid session was presented.',
  })
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ status: 'ok' }> {
    const token = request.headers.cookie
      ?.split(';')
      .map((part) => part.trim().split('='))
      .find(([name]) => name === SESSION_COOKIE_NAME)?.[1];

    if (token) {
      await this.auth.logout(decodeURIComponent(token));
    }

    response.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { status: 'ok' };
  }

  /**
   * The signed-in user and everything they may do.
   *
   * Open to any signed-in officer, including one with no role yet and one still
   * on a temporary password: this is a "who am I" endpoint, not a privileged
   * one, and the dashboard needs it to send them to the right place. It returns
   * effective permissions so the dashboard can hide what the user cannot do;
   * the guard remains the authority, and hiding a control is never the control
   * itself.
   */
  @SignedIn()
  @Get('me')
  @Documented({
    summary: 'Describe the signed-in user and their effective permissions.',
    description:
      'Returns each permission with the organisational scope in which it is held, so the ' +
      'dashboard can hide controls the user cannot use. Hiding a control is never the control ' +
      'itself — the guard remains the authority. `account` says whether the officer must ' +
      'change a temporary password, and where they stand with the second factor.',
  })
  async me(@Req() request: AuthenticatedRequest) {
    const user = this.user(request);
    return {
      user: { id: user.id, email: user.email, fullName: user.fullName },
      permissions: await this.permissions.listFor(user.id),
      account: await this.account.state(user),
    };
  }

  @SignedIn()
  @Post('password')
  @HttpCode(HttpStatus.OK)
  @Documented({
    summary: 'Change one’s own password.',
    description:
      'Item 28. The current password is required, even when it is a temporary one. The new ' +
      'one must be at least 12 characters and hold neither the officer’s name nor their email. ' +
      'It ends every other session of theirs. An officer on a temporary password can use no ' +
      'other route until this succeeds.',
    body: changePasswordSchema,
    responses: { 401: 'The current password was not accepted.' },
  })
  async changePassword(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(changePasswordSchema))
    body: ChangePasswordInput,
  ): Promise<{ status: 'ok' }> {
    await this.account.changePassword(
      this.user(request),
      body,
      request.ip ?? null,
    );
    return { status: 'ok' };
  }

  @SignedIn()
  @Post('mfa/enrol')
  @HttpCode(HttpStatus.OK)
  @Documented({
    summary: 'Start setting up an authenticator app.',
    description:
      'PRD Requirement 17.1. Returns the key to type into an authenticator app, and the same ' +
      'as an `otpauth` link, once. Nothing changes until a code confirms it. An officer who ' +
      'already has a second factor must have proved it in this session to replace it.',
    responses: {
      403: 'A second factor exists, and this session has not proved it.',
      503: 'The second factor is not configured on this deployment.',
    },
  })
  async enrolSecondFactor(@Req() request: AuthenticatedRequest) {
    return this.account.enrol(this.user(request));
  }

  @SignedIn()
  @Post('mfa/confirm')
  @HttpCode(HttpStatus.OK)
  @Documented({
    summary: 'Confirm the authenticator app with a code.',
    description:
      'Makes the key from `mfa/enrol` the officer’s second factor, marks this session as ' +
      'having proved it, ends their other sessions, and returns ten recovery codes, once. ' +
      'Each recovery code works a single time in place of the app.',
    body: secondFactorSchema,
    responses: { 409: 'No second factor is being set up.' },
  })
  async confirmSecondFactor(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(secondFactorSchema)) body: SecondFactorInput,
  ) {
    return this.account.confirm(
      this.user(request),
      body.code,
      request.ip ?? null,
    );
  }

  @SignedIn()
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @Documented({
    summary: 'Prove the second factor for this session.',
    description:
      'For a session that began before the officer needed one. Afterwards the session may ' +
      'use privileged permissions (Requirement 17.1).',
    body: secondFactorSchema,
    responses: { 409: 'No second factor is set up.' },
  })
  async verifySecondFactor(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(secondFactorSchema)) body: SecondFactorInput,
  ): Promise<{ status: 'ok' }> {
    await this.account.verify(
      this.user(request),
      body.code,
      request.ip ?? null,
    );
    return { status: 'ok' };
  }

  @SignedIn()
  @Post('mfa/recovery-codes')
  @HttpCode(HttpStatus.OK)
  @Documented({
    summary: 'Replace one’s recovery codes.',
    description:
      'Returns ten new recovery codes, once, and cancels the old ones. Needs a session that ' +
      'has proved the second factor.',
    responses: { 403: 'This session has not proved the second factor.' },
  })
  async replaceRecoveryCodes(@Req() request: AuthenticatedRequest) {
    return this.account.regenerateRecoveryCodes(
      this.user(request),
      request.ip ?? null,
    );
  }

  /** Set by the guard on every session route; its absence is a wiring fault. */
  private user(request: AuthenticatedRequest): SessionUser {
    if (!request.user) {
      throw new BadRequestException();
    }
    return request.user;
  }

  /**
   * Decision 9.7.1 — "who may currently exercise this permission, and where".
   *
   * Exists because `vehicle.declare` is held so narrowly that it is worthless as
   * a control if establishing who holds it requires reasoning across role
   * bundles, grants, and revocations by hand.
   */
  @RequirePermission('permission.read')
  @Get('holders')
  @Documented({
    summary: 'List who currently holds a permission, and in what scope.',
    description:
      'Answers across role bundles, per-user grants, and per-user revocations, with revocations ' +
      'applied. It exists because `vehicle.declare` is held so narrowly that it is worthless as ' +
      'a control if establishing who holds it requires reasoning through those three layers by ' +
      'hand.',
    query: [
      {
        name: 'permission',
        description: 'The permission code to enquire about, for example `vehicle.declare`.',
        required: true,
      },
    ],
    responses: { 400: 'No permission code was supplied.' },
  })
  async holders(@Req() request: AuthenticatedRequest) {
    const permission = request.query.permission;
    if (typeof permission !== 'string' || permission.length === 0) {
      throw new BadRequestException();
    }
    return {
      permission,
      holders: await this.permissions.listHolders(permission),
    };
  }
}
