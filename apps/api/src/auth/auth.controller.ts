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
import { loginSchema, type LoginInput } from '@nurtw/contracts';
import type { Response } from 'express';

import { Documented } from '../docs/documented.decorator.js';
import { AuthService } from './auth.service.js';
import {
  SESSION_COOKIE_NAME,
  type AuthenticatedRequest,
} from './authorisation.guard.js';
import { PermissionService } from './permission.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Public, RequirePermission } from './require-permission.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly permissions: PermissionService,
  ) {}

  /**
   * The session cookie.
   *
   * `httpOnly` so script cannot read it — the single most effective mitigation
   * against a stolen session via XSS. `secure` outside development. `sameSite:
   * none` is required because the dashboard (Vercel) and the API (DigitalOcean)
   * are different origins; `secure` is mandatory alongside it, which is why the
   * pair is set together rather than independently.
   */
  private cookieOptions(expiresAt: Date) {
    const isProduction = process.env.NODE_ENV === 'production';
    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? ('none' as const) : ('lax' as const),
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
      'take comparable time, so neither existence nor near-misses can be inferred.',
    body: loginSchema,
    responses: { 401: 'The credentials were not accepted.' },
  })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ status: 'ok' }> {
    const { email, password } = body;

    const session = await this.auth.login(email, password, {
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
   * Requires only `organisation.read`, which every internal role holds — this is
   * a "who am I" endpoint, not a privileged one. It returns effective
   * permissions so the dashboard can hide what the user cannot do; the guard
   * remains the authority, and hiding a control is never the control itself.
   */
  @RequirePermission('organisation.read')
  @Get('me')
  @Documented({
    summary: 'Describe the signed-in user and their effective permissions.',
    description:
      'Returns each permission with the organisational scope in which it is held, so the ' +
      'dashboard can hide controls the user cannot use. Hiding a control is never the control ' +
      'itself — the guard remains the authority. Requires only `organisation.read`, which every ' +
      'internal role holds; this is a "who am I" endpoint, not a privileged one.',
  })
  async me(@Req() request: AuthenticatedRequest) {
    const user = request.user;
    if (!user) {
      throw new BadRequestException();
    }

    return {
      user: { id: user.id, email: user.email, fullName: user.fullName },
      permissions: await this.permissions.listFor(user.id),
    };
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
