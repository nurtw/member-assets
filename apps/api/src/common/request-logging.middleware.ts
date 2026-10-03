import { Logger } from '@nestjs/common';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import type { ExternalRequest } from '../auth/require-scope.decorator.js';
import { resolveRequestId } from './error-response.js';

const REDACTED = '[redacted]';

/**
 * Query parameter names whose value must never reach a log line — a signed
 * media link's `signature` (see `media.controller.ts`) is a bearer credential
 * in the same sense a session or API token is, even though it travels in the
 * URL rather than a header.
 */
const SENSITIVE_QUERY_KEY = /token|secret|password|signature|auth|key$/i;

/**
 * Anything with the form of an external API token (`api-client/api-token.ts`).
 *
 * A token is only ever read from the `Authorization` header, so one placed in
 * a URL authenticates nothing. It is still a live credential that an
 * integrator sent by mistake, and PRD Requirement 12.2 forbids it reaching a
 * log whatever key or path segment it arrived in.
 */
const API_TOKEN_SHAPE = /nurtw_[a-z0-9]{8}_[A-Za-z0-9_-]{20,}/g;

function withoutTokens(text: string): string {
  return text.replace(API_TOKEN_SHAPE, REDACTED);
}

function sanitisedQuery(query: Request['query']): string {
  const entries = Object.entries(query as Record<string, unknown>);
  if (entries.length === 0) {
    return '';
  }
  const parts = entries.map(
    ([key, value]) =>
      `${key}=${SENSITIVE_QUERY_KEY.test(key) ? REDACTED : withoutTokens(String(value))}`,
  );
  return `?${parts.join('&')}`;
}

/**
 * A raw request URL made safe to log: a sensitive query value is replaced, and
 * so is anything shaped like an API token, wherever it sits. For a caller
 * holding only `request.url`, as the exception filter does.
 */
export function redactUrl(url: string): string {
  const mark = url.indexOf('?');
  if (mark === -1) {
    return withoutTokens(url);
  }
  const parts = [...new URLSearchParams(url.slice(mark + 1)).entries()].map(
    ([key, value]) =>
      `${key}=${SENSITIVE_QUERY_KEY.test(key) ? REDACTED : withoutTokens(value)}`,
  );
  const path = withoutTokens(url.slice(0, mark));
  return parts.length === 0 ? path : `${path}?${parts.join('&')}`;
}

/**
 * One access-log line per request, written when the response finishes so it
 * always carries a real status code and the total duration — including a
 * request a guard rejected before any controller ran, and one matching no
 * route at all.
 *
 * Deliberately an access log, not a body dump. CLAUDE.md forbids logging full
 * tokens, signatures, guarantor details, or chassis/VIN, and those arrive as
 * JSON body fields on exactly the routes this middleware also wraps.
 * `AuditService` already records the material before/after values for
 * anything that writes; this line exists to answer "which requests hit the
 * API, when, with what outcome" — an operational record, not a second copy of
 * the audit trail.
 *
 * Register with `app.use(requestLoggingMiddleware())` in `main.ts` **before**
 * `app.init()` — the same reasoning as the terminal not-found handler
 * registered after it: middleware added ahead of `init()` runs ahead of
 * Nest's router, so it wraps every request, including ones a route never
 * sees.
 *
 * Resolves `X-Request-Id` and stamps it onto the *request* headers (not only
 * the response), so `AllExceptionsFilter`, which reads that same header,
 * logs and returns the identical id this line carries. One id per request,
 * whichever way it ends.
 */
export function requestLoggingMiddleware(): RequestHandler {
  const logger = new Logger('HTTP');

  return (
    request: AuthenticatedRequest & ExternalRequest,
    response: Response,
    next: NextFunction,
  ): void => {
    const requestId = resolveRequestId(request.header('x-request-id'));
    request.headers['x-request-id'] = requestId;
    response.setHeader('X-Request-Id', requestId);

    const startedAt = process.hrtime.bigint();

    response.on('finish', () => {
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const path = `${withoutTokens(request.path)}${sanitisedQuery(request.query)}`;
      const requestLength = request.headers['content-length'] ?? '-';
      const responseLength = response.getHeader('content-length') ?? '-';
      const userId = request.user?.id ?? '-';
      // An external request is made by an organisation, not an officer. Its
      // client id identifies it here; its token never does.
      const clientId = request.apiClient?.clientId ?? '-';
      const userAgent = request.header('user-agent') ?? '-';

      const line =
        `${request.method} ${path} ${response.statusCode} ${durationMs.toFixed(1)}ms ` +
        `reqLen=${requestLength} resLen=${responseLength} ip=${request.ip} ` +
        `user=${userId} client=${clientId} ua="${userAgent}" id=${requestId}`;

      if (response.statusCode >= 500) {
        logger.error(line);
      } else if (response.statusCode >= 400) {
        logger.warn(line);
      } else {
        logger.log(line);
      }
    });

    next();
  };
}
