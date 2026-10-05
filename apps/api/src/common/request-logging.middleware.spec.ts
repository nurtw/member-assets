import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { NextFunction, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import {
  redactUrl,
  requestLoggingMiddleware,
} from './request-logging.middleware.js';

/** Has the form of an external API token, and is not one. */
const TOKEN = `nurtw_abcdefgh_${'A'.repeat(43)}`;

/**
 * This is an access log, not a body dump — CLAUDE.md forbids logging full
 * tokens, signatures, guarantor details, or chassis/VIN, and a signed media
 * link's `signature` query parameter is exactly such a credential. These
 * tests exist to keep that true, not merely to check a line was written.
 */
describe('requestLoggingMiddleware', () => {
  let requestHeaders: Record<string, string>;
  let request: AuthenticatedRequest;
  let response: Response;
  let responseHeaders: Record<string, string>;
  // A workspace-root `tsc` run resolves a different `@types/express` copy
  // than a package-scoped one, under which `vi.fn()`'s inferred type is not
  // structurally assignable to `NextFunction`. Cast once here rather than at
  // every call site below.
  let next: NextFunction;

  const finish = () => (response as unknown as EventEmitter).emit('finish');

  beforeEach(() => {
    // vi.spyOn on an already-spied method reuses the same mock and its call
    // history, so without this, calls from an earlier test leak into the
    // next one's assertions.
    vi.restoreAllMocks();

    requestHeaders = {};
    responseHeaders = {};

    request = {
      method: 'GET',
      path: '/api/v1/members',
      query: {},
      headers: requestHeaders,
      header: (name: string) => requestHeaders[name.toLowerCase()],
      ip: '203.0.113.7',
    } as unknown as AuthenticatedRequest;

    const emitter = new EventEmitter();
    response = Object.assign(emitter, {
      statusCode: 200,
      setHeader: (name: string, value: string) => {
        responseHeaders[name] = value;
      },
      getHeader: (name: string) => responseHeaders[name],
    }) as unknown as Response;

    next = vi.fn() as unknown as NextFunction;

    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('calls next so the request proceeds', () => {
    requestLoggingMiddleware()(request, response, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('mints a request id and stamps it on both request and response', () => {
    requestLoggingMiddleware()(request, response, next);

    expect(requestHeaders['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(responseHeaders['X-Request-Id']).toBe(requestHeaders['x-request-id']);
  });

  it('echoes a caller-supplied request id instead of minting one', () => {
    requestHeaders['x-request-id'] = 'caller-supplied-id';

    requestLoggingMiddleware()(request, response, next);

    expect(requestHeaders['x-request-id']).toBe('caller-supplied-id');
    expect(responseHeaders['X-Request-Id']).toBe('caller-supplied-id');
  });

  it('logs at "log" level for a successful response', () => {
    requestLoggingMiddleware()(request, response, next);
    response.statusCode = 200;
    finish();

    expect(Logger.prototype.log).toHaveBeenCalledOnce();
    expect(Logger.prototype.warn).not.toHaveBeenCalled();
    expect(Logger.prototype.error).not.toHaveBeenCalled();
  });

  it('logs at "warn" level for a client error', () => {
    requestLoggingMiddleware()(request, response, next);
    response.statusCode = 404;
    finish();

    expect(Logger.prototype.warn).toHaveBeenCalledOnce();
    expect(Logger.prototype.log).not.toHaveBeenCalled();
  });

  it('logs at "error" level for a server error', () => {
    requestLoggingMiddleware()(request, response, next);
    response.statusCode = 500;
    finish();

    expect(Logger.prototype.error).toHaveBeenCalledOnce();
  });

  it('includes the authenticated user id once the guard has set it', () => {
    requestLoggingMiddleware()(request, response, next);
    // The guard runs after this middleware and mutates the same request
    // object; the log line is only written on "finish", after it has run.
    request.user = {
      id: 'user-123',
      email: 'officer@example.org',
      fullName: 'Test Officer',
    } as AuthenticatedRequest['user'];
    finish();

    const line = (Logger.prototype.log as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(line).toContain('user=user-123');
  });

  it('logs "-" for the user when the request never authenticated', () => {
    requestLoggingMiddleware()(request, response, next);
    finish();

    const line = (Logger.prototype.log as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(line).toContain('user=-');
  });

  it('redacts a signed link signature in the query string', () => {
    request.query = { expires: '1999999999', signature: 'super-secret-hmac' };

    requestLoggingMiddleware()(request, response, next);
    finish();

    const line = (Logger.prototype.log as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(line).not.toContain('super-secret-hmac');
    expect(line).toContain('signature=[redacted]');
    expect(line).toContain('expires=1999999999');
  });

  it('never logs the session cookie or authorization header', () => {
    requestHeaders.cookie = 'nurtw_session=super-secret-session-token';
    requestHeaders.authorization = 'Bearer super-secret-api-token';

    requestLoggingMiddleware()(request, response, next);
    finish();

    const line = (Logger.prototype.log as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(line).not.toContain('super-secret-session-token');
    expect(line).not.toContain('super-secret-api-token');
  });

  it('never logs an API token put in a URL by mistake, under any key (Requirement 12.2)', () => {
    // A token in a URL authenticates nothing, and is still a live credential.
    (request as { path: string }).path = `/api/v1/verification/${TOKEN}`;
    request.query = { token: TOKEN, q: TOKEN, plate: 'AA123XY' };

    requestLoggingMiddleware()(request, response, next);
    finish();

    const line = (Logger.prototype.log as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(line).not.toContain(TOKEN);
    expect(line).not.toContain('A'.repeat(43));
    expect(line).toContain('plate=AA123XY');
  });

  it('names the external client once the guard has resolved its token', () => {
    requestLoggingMiddleware()(request, response, next);
    Object.assign(request, { apiClient: { clientId: 'client-9' } });
    finish();

    const line = (Logger.prototype.log as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(line).toContain('client=client-9');
    expect(line).toContain('user=-');
  });
});

describe('redactUrl', () => {
  it('leaves a URL with nothing sensitive as it was', () => {
    expect(redactUrl('/api/v1/vehicles')).toBe('/api/v1/vehicles');
    expect(redactUrl('/api/v1/vehicles?status=ACTIVE&page=2')).toBe(
      '/api/v1/vehicles?status=ACTIVE&page=2',
    );
  });

  it('redacts a sensitive key and a token under any key or in the path', () => {
    const redacted = redactUrl(
      `/api/v1/x/${TOKEN}?signature=abc&access_token=def&q=${TOKEN}&plate=AA123XY`,
    );
    expect(redacted).not.toContain(TOKEN);
    expect(redacted).not.toContain('abc');
    expect(redacted).not.toContain('def');
    expect(redacted).toContain('plate=AA123XY');
  });

  it("redacts a pay link's code from the path, and nothing shorter", () => {
    const code = 'AbCdEfGhIjKlMnOpQrSt_-';
    expect(redactUrl(`/api/v1/pay/${code}`)).toBe('/api/v1/pay/[redacted]');
    expect(redactUrl(`/api/v1/pay/${code}?paid=1`)).toBe(
      '/api/v1/pay/[redacted]?paid=1',
    );
    // The officer's routes carry an identifier, not a code.
    expect(redactUrl('/api/v1/pay-links/7d1f0c2e-1b2a-4c3d-8e4f-5a6b7c8d9e0f/replace')).toBe(
      '/api/v1/pay-links/7d1f0c2e-1b2a-4c3d-8e4f-5a6b7c8d9e0f/replace',
    );
    expect(redactUrl('/api/v1/payments/initiate')).toBe('/api/v1/payments/initiate');
  });

  it("redacts an invitation's code from the path (item 33)", () => {
    const code = 'AbCdEfGhIjKlMnOpQrSt_-';
    expect(redactUrl(`/api/v1/portal/invitations/${code}`)).toBe(
      '/api/v1/portal/invitations/[redacted]',
    );
    // The officers' routes carry an identifier, not a code.
    expect(
      redactUrl(
        '/api/v1/organisation-invitations/7d1f0c2e-1b2a-4c3d-8e4f-5a6b7c8d9e0f/withdrawal',
      ),
    ).toBe(
      '/api/v1/organisation-invitations/7d1f0c2e-1b2a-4c3d-8e4f-5a6b7c8d9e0f/withdrawal',
    );
  });
});
