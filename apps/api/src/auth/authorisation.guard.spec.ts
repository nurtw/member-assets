import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AuthorisationGuard,
  SESSION_COOKIE_NAME,
} from './authorisation.guard.js';
import type { PermissionService } from './permission.service.js';
import {
  PERMISSION_METADATA_KEY,
  PUBLIC_METADATA_KEY,
} from './require-permission.decorator.js';
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
  let guard: AuthorisationGuard;
  let metadata: Record<string, unknown>;
  let request: { headers: Record<string, string>; user?: unknown };

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

    guard = new AuthorisationGuard(
      reflector,
      sessions as unknown as SessionService,
      permissions as unknown as PermissionService,
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
  });
});
