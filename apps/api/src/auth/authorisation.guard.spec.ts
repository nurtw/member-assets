import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiClientAuthService } from '../api-client/api-client-auth.service.js';
import {
  AuthorisationGuard,
  SESSION_COOKIE_NAME,
} from './authorisation.guard.js';
import type { PermissionService } from './permission.service.js';
import {
  PERMISSION_METADATA_KEY,
  PUBLIC_METADATA_KEY,
} from './require-permission.decorator.js';
import { SCOPE_METADATA_KEY } from './require-scope.decorator.js';
import type { SessionService } from './session.service.js';

/**
 * Deny-by-default is the property under test. Everything else in this guard is
 * plumbing; this is the part that, if wrong, silently opens the system.
 */
describe('AuthorisationGuard', () => {
  let reflector: Reflector;
  let sessions: { resolve: ReturnType<typeof vi.fn> };
  let permissions: {
    can: ReturnType<typeof vi.fn>;
    canAnywhere: ReturnType<typeof vi.fn>;
  };
  let apiClients: { authenticate: ReturnType<typeof vi.fn> };
  let guard: AuthorisationGuard;
  let metadata: Record<string, unknown>;
  let request: {
    headers: Record<string, string>;
    user?: unknown;
    apiClient?: unknown;
    method?: string;
    path?: string;
    route?: { path: string };
    ip?: string;
  };

  const contextFor = (): ExecutionContext =>
    ({
      getHandler: () => 'handler',
      getClass: () => 'controller',
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    metadata = {};
    request = { headers: {} };

    reflector = {
      getAllAndOverride: (key: string) => metadata[key],
    } as unknown as Reflector;

    sessions = { resolve: vi.fn() };
    permissions = { can: vi.fn(), canAnywhere: vi.fn() };
    apiClients = { authenticate: vi.fn() };

    guard = new AuthorisationGuard(
      reflector,
      sessions as unknown as SessionService,
      permissions as unknown as PermissionService,
      apiClients as unknown as ApiClientAuthService,
    );
  });

  const withSession = (token = 'valid-token') => {
    request.headers.cookie = `${SESSION_COOKIE_NAME}=${token}`;
    sessions.resolve.mockResolvedValue({
      id: 'user-1',
      email: 'officer@example.test',
      fullName: 'Test Officer',
    });
  };

  it('allows a route marked @Public without a session', async () => {
    metadata[PUBLIC_METADATA_KEY] = true;

    await expect(guard.canActivate(contextFor())).resolves.toBe(true);
    expect(sessions.resolve).not.toHaveBeenCalled();
  });

  it('DENIES an authenticated request to a route declaring no permission', async () => {
    // The single most important assertion here. An undeclared route is an
    // oversight; an oversight must fail closed.
    withSession();
    metadata[PERMISSION_METADATA_KEY] = undefined;

    await expect(guard.canActivate(contextFor())).rejects.toThrow(
      ForbiddenException,
    );
    expect(permissions.canAnywhere).not.toHaveBeenCalled();
  });

  it('rejects a request with no cookie at all', async () => {
    metadata[PERMISSION_METADATA_KEY] = 'vehicle.read';

    await expect(guard.canActivate(contextFor())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a session token that does not resolve', async () => {
    request.headers.cookie = `${SESSION_COOKIE_NAME}=revoked-or-expired`;
    sessions.resolve.mockResolvedValue(null);
    metadata[PERMISSION_METADATA_KEY] = 'vehicle.read';

    await expect(guard.canActivate(contextFor())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('allows when the user holds the declared permission', async () => {
    withSession();
    metadata[PERMISSION_METADATA_KEY] = 'vehicle.read';
    permissions.canAnywhere.mockResolvedValue(true);

    await expect(guard.canActivate(contextFor())).resolves.toBe(true);
    expect(permissions.canAnywhere).toHaveBeenCalledWith(
      'user-1',
      'vehicle.read',
    );
  });

  it('denies when the user lacks the declared permission', async () => {
    withSession();
    metadata[PERMISSION_METADATA_KEY] = 'vehicle.declare';
    permissions.canAnywhere.mockResolvedValue(false);

    await expect(guard.canActivate(contextFor())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('asks for a permission, never a role', async () => {
    // Decision 9.2 — guards against a future refactor that checks role names.
    withSession();
    metadata[PERMISSION_METADATA_KEY] = 'card.issue';
    permissions.canAnywhere.mockResolvedValue(true);

    await guard.canActivate(contextFor());

    const [, requested] = permissions.canAnywhere.mock.calls[0] as [
      string,
      string,
    ];
    expect(requested).toMatch(/^[a-z_]+\.[a-z_]+$/);
    expect(requested).not.toMatch(/administrator|officer|role/i);
  });

  it('attaches the resolved user to the request', async () => {
    withSession();
    metadata[PERMISSION_METADATA_KEY] = 'vehicle.read';
    permissions.canAnywhere.mockResolvedValue(true);

    await guard.canActivate(contextFor());

    expect(request.user).toMatchObject({ id: 'user-1' });
  });

  it('ignores unrelated cookies', async () => {
    request.headers.cookie = 'other=1; something_else=2';
    metadata[PERMISSION_METADATA_KEY] = 'vehicle.read';

    await expect(guard.canActivate(contextFor())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('reads the session cookie from among others', async () => {
    request.headers.cookie = `theme=dark; ${SESSION_COOKIE_NAME}=abc123; other=1`;
    sessions.resolve.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.test',
      fullName: 'A',
    });
    metadata[PERMISSION_METADATA_KEY] = 'vehicle.read';
    permissions.canAnywhere.mockResolvedValue(true);

    await expect(guard.canActivate(contextFor())).resolves.toBe(true);
    expect(sessions.resolve).toHaveBeenCalledWith('abc123');
  });

  it('does not accept a bearer token in place of a session', async () => {
    // Decision 9.8 — an API token must never authenticate a dashboard session.
    // The two systems share no storage and no credential path.
    request.headers.authorization = 'Bearer some-api-token';
    metadata[PERMISSION_METADATA_KEY] = 'vehicle.read';

    await expect(guard.canActivate(contextFor())).rejects.toThrow(
      UnauthorizedException,
    );
    expect(sessions.resolve).not.toHaveBeenCalled();
    expect(apiClients.authenticate).not.toHaveBeenCalled();
  });

  /**
   * Item 11 — a route carrying `@RequireScope` is external. Decisions 9.1 and
   * 9.8: the two credentials never cross, in either direction.
   */
  describe('a route that requires a scope', () => {
    const client = { clientId: 'client-1', tokenId: 'token-1' };

    beforeEach(() => {
      metadata[SCOPE_METADATA_KEY] = 'vehicle:verify:plate';
      request = {
        headers: { authorization: 'Bearer the-token', 'x-request-id': 'req-1' },
        method: 'POST',
        path: '/api/v1/verification/vehicle/plate',
        route: { path: '/api/v1/verification/vehicle/plate' },
        ip: '203.0.113.7',
      };
    });

    it('is authenticated by API token, and never touches the session', async () => {
      apiClients.authenticate.mockResolvedValue(client);

      await expect(guard.canActivate(contextFor())).resolves.toBe(true);

      expect(apiClients.authenticate).toHaveBeenCalledWith(
        {
          authorization: 'Bearer the-token',
          ipAddress: '203.0.113.7',
          endpoint: 'POST /api/v1/verification/vehicle/plate',
          requestId: 'req-1',
        },
        'vehicle:verify:plate',
      );
      expect(request.apiClient).toBe(client);
      expect(request.user).toBeUndefined();
      expect(sessions.resolve).not.toHaveBeenCalled();
      expect(permissions.canAnywhere).not.toHaveBeenCalled();
    });

    it('does not accept a session in place of a token', async () => {
      // An officer signed in to the dashboard cannot reach an external route
      // with their cookie: it is not read.
      withSession();
      delete request.headers.authorization;
      apiClients.authenticate.mockRejectedValue(new UnauthorizedException());

      await expect(guard.canActivate(contextFor())).rejects.toThrow(
        UnauthorizedException,
      );
      expect(sessions.resolve).not.toHaveBeenCalled();
      expect(apiClients.authenticate.mock.calls[0]?.[0]).toMatchObject({
        authorization: undefined,
      });
    });

    it('passes on the refusal the token path gives', async () => {
      apiClients.authenticate.mockRejectedValue(new ForbiddenException());

      await expect(guard.canActivate(contextFor())).rejects.toThrow(
        ForbiddenException,
      );
      expect(request.apiClient).toBeUndefined();
    });

    it('logs the route pattern, never the URL it was called with', async () => {
      apiClients.authenticate.mockResolvedValue(client);
      request.path = '/api/v1/things/secret-looking-id';
      request.route = { path: '/api/v1/things/:id' };

      await guard.canActivate(contextFor());

      expect(apiClients.authenticate.mock.calls[0]?.[0]).toMatchObject({
        endpoint: 'POST /api/v1/things/:id',
      });
    });

    it('REFUSES a route that also declares a permission', async () => {
      // Misdeclared. Guessing which was meant would be guessing who may call it.
      metadata[PERMISSION_METADATA_KEY] = 'vehicle.read';
      withSession();
      apiClients.authenticate.mockResolvedValue(client);

      await expect(guard.canActivate(contextFor())).rejects.toThrow(
        ForbiddenException,
      );
      expect(apiClients.authenticate).not.toHaveBeenCalled();
      expect(sessions.resolve).not.toHaveBeenCalled();
    });

    it('REFUSES a route that is also marked public, instead of opening it', async () => {
      metadata[PUBLIC_METADATA_KEY] = true;

      await expect(guard.canActivate(contextFor())).rejects.toThrow(
        ForbiddenException,
      );
      expect(apiClients.authenticate).not.toHaveBeenCalled();
    });
  });
});
