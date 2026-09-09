import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { PermissionService } from './permission.service.js';
import {
  PERMISSION_METADATA_KEY,
  PUBLIC_METADATA_KEY,
} from './require-permission.decorator.js';
import { SessionService, type SessionUser } from './session.service.js';

export const SESSION_COOKIE_NAME = 'nurtw_session';

/** Set on the request once a session resolves, for controllers to read. */
export interface AuthenticatedRequest extends Request {
  user?: SessionUser;
}

/**
 * Authentication and authorisation, in one pass, denying by default.
 *
 * **Deny by default is the whole point.** A route carrying neither `@Public()`
 * nor `@RequirePermission()` is refused. If the failure mode were "allow", every
 * route added without thought would become a hole and nobody would notice until
 * an audit — which, for a system holding the personal data of union members, is
 * precisely the outcome the Union is paying to avoid.
 *
 * ARCHITECTURE.md Decision 9.9 — evaluated before the controller runs.
 * Decision 9.2 — the check names a permission, never a role.
 * Decision 9.8 — this guard authenticates *sessions* only. An API token can
 * never satisfy it; external clients are authorised by scope through a separate
 * mechanism sharing no storage.
 */
@Injectable()
export class AuthorisationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly permissions: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const controller = context.getClass();

    const isPublic = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_METADATA_KEY,
      [handler, controller],
    );
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException();
    }

    const user = await this.sessions.resolve(token);
    if (!user) {
      throw new UnauthorizedException();
    }
    request.user = user;

    const required = this.reflector.getAllAndOverride<string | undefined>(
      PERMISSION_METADATA_KEY,
      [handler, controller],
    );

    if (!required) {
      // Authenticated but the route declares no permission. Refused, not
      // allowed: an undeclared route is an oversight, and an oversight must fail
      // closed. Annotate it with @RequirePermission() or @Public().
      throw new ForbiddenException();
    }

    /**
     * Scope resolution.
     *
     * These routes act on no particular record, so there is no subject whose
     * organisation path could be tested, and the check is "does this user hold
     * the permission anywhere".
     *
     * Testing against the root instead would be wrong in both directions: too
     * strict, because a branch administrator legitimately holds permissions
     * without holding them Union-wide, and meaningless, because no record lives
     * at the root. That was the first implementation and it locked out the
     * super administrator, whose role is assigned at council scope.
     *
     * **Record-scoped routes must not rely on this.** From item 04 onward, a
     * route acting on a specific member, vehicle, card, or sticker resolves that
     * record's organisation path and calls `permissions.can(user, permission,
     * path)`, so that holding a permission in one branch never authorises acting
     * on another (Decision 9.4).
     */
    const allowed = await this.permissions.canAnywhere(user.id, required);
    if (!allowed) {
      throw new ForbiddenException();
    }

    return true;
  }

  private extractToken(request: AuthenticatedRequest): string | null {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) {
      return null;
    }

    for (const part of cookieHeader.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === SESSION_COOKIE_NAME) {
        const value = rest.join('=');
        return value.length > 0 ? decodeURIComponent(value) : null;
      }
    }
    return null;
  }
}
