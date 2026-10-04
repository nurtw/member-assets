import { randomUUID } from 'node:crypto';

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

import { ApiClientAuthService } from '../api-client/api-client-auth.service.js';
import { ApiRequestLogService } from '../api-client/api-request-log.service.js';
import {
  isAcceptableRequestId,
  resolveRequestId,
} from '../common/error-response.js';
import { ValidationException } from '../common/zod-validation.pipe.js';
import { RateLimitService } from '../rate-limit/rate-limit.service.js';
import { PermissionService } from './permission.service.js';
import {
  PERMISSION_METADATA_KEY,
  PUBLIC_METADATA_KEY,
} from './require-permission.decorator.js';
import {
  SCOPE_METADATA_KEY,
  type ExternalRequest,
} from './require-scope.decorator.js';
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
 * Decisions 9.1 and 9.8 — a route is internal or external, never both, and
 * the two credentials never cross:
 *
 * - A route carrying `@RequireScope` is **external**. It is authenticated by
 *   API token alone, through `ApiClientAuthService`. The session cookie is not
 *   read, so a signed-in officer cannot reach it with their session.
 * - Every other route is **internal**. It is authenticated by session alone.
 *   The `Authorization` header is not read, so an API token can never satisfy
 *   a permission.
 *
 * One guard decides which path a route takes, so that "denies by default"
 * stays a statement about one place.
 */
@Injectable()
export class AuthorisationGuard implements CanActivate {
  private readonly logger = new Logger(AuthorisationGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly permissions: PermissionService,
    private readonly apiClients: ApiClientAuthService,
    private readonly requests: ApiRequestLogService,
    private readonly rateLimits: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const controller = context.getClass();

    const isPublic = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_METADATA_KEY,
      [handler, controller],
    );
    const scope = this.reflector.getAllAndOverride<string | undefined>(
      SCOPE_METADATA_KEY,
      [handler, controller],
    );

    // Checked before `@Public()`, so a scope route marked public by mistake
    // is refused instead of opened.
    if (scope) {
      return this.authenticateExternal(context, scope, isPublic === true);
    }

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

  /**
   * The external path. A token is the only credential considered.
   *
   * A route that declares a scope together with a permission, or with
   * `@Public()`, has been declared wrongly. It is refused outright: guessing
   * which was meant would be a guess about who may call it.
   *
   * In order: the token (item 11), the caller's request id, then the limits
   * (item 13). Each refusal is logged once, here or in `ApiClientAuthService`.
   */
  private async authenticateExternal(
    context: ExecutionContext,
    scope: string,
    isPublic: boolean,
  ): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<string | undefined>(
      PERMISSION_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic || permission) {
      throw new ForbiddenException();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<ExternalRequest>();
    const response = http.getResponse<Response>();
    const header = request.headers['x-request-id'];
    const supplied = Array.isArray(header) ? header[0] : header;
    const requestId = resolveRequestId(supplied);
    const route = (request.route as { path?: string } | undefined)?.path;
    // The route pattern, never the URL: a query string is not logged.
    const endpoint = `${request.method} ${route ?? request.path}`;

    // Proposal §14.3 — the System's own id for the request, on every answer
    // from here on, refusals included.
    const serverRequestId = randomUUID();
    request.serverRequestId = serverRequestId;
    response.setHeader('X-Server-Request-ID', serverRequestId);

    const client = await this.apiClients.authenticate(
      {
        authorization: request.headers.authorization,
        ipAddress: request.ip,
        endpoint,
        requestId,
        serverRequestId,
      },
      scope,
    );
    request.apiClient = client;

    const refused = (resultClass: string, statusCode: number) =>
      this.requests.record({
        requestId,
        serverRequestId,
        endpoint,
        scope,
        resultClass,
        statusCode,
        clientId: client.clientId,
        tokenId: client.tokenId,
        ipAddress: request.ip ?? null,
        rateLimited: statusCode === 429,
      });

    // Proposal §14.3 — an external caller sends its own request id. Checked
    // once the token is accepted, so the refusal is logged against the
    // organisation, and before the limits, so it spends none of them.
    if (!isAcceptableRequestId(supplied)) {
      // The id minted above is the one logged; the error body carries it too.
      request.headers['x-request-id'] = requestId;
      await refused('NO_REQUEST_ID', 400);
      throw new ValidationException([
        {
          field: 'X-Request-ID',
          message:
            'Send your own request id, of up to 200 printable characters, in the X-Request-ID header.',
        },
      ]);
    }

    // PRD §14 — the quota layer (Decision 8.1). A refusal is logged, never
    // counted against a quota, and answered 429 with Retry-After
    // (acceptance criterion 7).
    const admission = await this.rateLimits.admit(client, scope);
    if (!admission.allowed) {
      await refused(admission.refusal, 429);
      this.logger.warn(
        `${endpoint} refused: ${admission.refusal} client=${client.clientId} [${requestId}]`,
      );
      response.setHeader('Retry-After', String(admission.retryAfterSeconds));
      throw new HttpException(
        'Too many requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );
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
