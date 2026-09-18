/**
 * Load `.env` before anything reads configuration.
 *
 * `nest start` runs the compiled entry point directly and does **not** load an
 * env file, so without this the API sees only variables exported in the shell.
 * That failed silently and in the worst possible way: `DATABASE_URL` happened to
 * be exported, so the service started and looked healthy, while `CORS_ORIGINS`
 * was absent — `enableCors` was skipped, and every browser request was refused
 * by the browser itself. Nothing in the server logs said so, because the request
 * never arrived.
 *
 * Placed above every other import: `loadEnvironment()` reads `process.env` at
 * call time, and an import that ran first would read it unpopulated. `dotenv`
 * never overwrites a variable already set, so a real deployment's environment
 * still wins and a missing file is a no-op.
 */
import 'dotenv/config';

import { HttpStatus, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Request, Response } from 'express';

import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import {
  buildErrorResponse,
  resolveRequestId,
} from './common/error-response.js';
import { requestLoggingMiddleware } from './common/request-logging.middleware.js';
import { loadEnvironment } from './config/environment.js';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const env = loadEnvironment();

  const app = await NestFactory.create(AppModule, {
    // Request bodies are capped per PRD §14.3. Applied at creation so it holds
    // for every route, including any added later without thinking about it.
    bodyParser: true,
  });

  /**
   * Render terminates TLS at its own edge and forwards to this container over
   * a loopback connection, carrying the real client address only in
   * `X-Forwarded-For`. Without this, Express's `request.ip` reports that
   * loopback address for every request — the access log, the login-failure
   * log, and `AuditService.ipAddress` all showed `::1` regardless of who
   * actually connected. `1` trusts exactly one hop (Render's edge), not an
   * arbitrary chain a client could forge by sending its own
   * `X-Forwarded-For`.
   */
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  /**
   * Access log. Added before anything else in the chain — including
   * `setGlobalPrefix` and CORS below — so every request is logged with its
   * outcome, even one CORS or the guard refuses before a controller runs.
   * See `request-logging.middleware.ts` for what it does and does not record.
   */
  app.use(requestLoggingMiddleware());

  /**
   * ARCHITECTURE.md Decision 11.1 — all external routes are prefixed `/api/v1`
   * from the first release. Version 1 is never broken once an external client
   * holds credentials against it; breaking changes ship as `/api/v2`, served
   * concurrently.
   *
   * Set here rather than repeated on each controller so a new controller cannot
   * accidentally be published unversioned.
   */
  app.setGlobalPrefix('api/v1');

  /**
   * Every failure leaves as generic JSON carrying a request id, never as
   * Express's default HTML error page. PRD Requirement 14.3 — a caller must not
   * be able to distinguish "no such route" from "no such record" from "not
   * permitted", because those differences describe the record set.
   */
  app.useGlobalFilters(new AllExceptionsFilter());

  /**
   * Browser access is restricted to explicitly configured origins. The external
   * verification API is machine-to-machine and authenticated by token
   * (ARCHITECTURE.md Decision 9.8); it does not rely on CORS for its security,
   * but there is no reason to permit arbitrary origins either.
   */
  if (env.corsOrigins.length > 0) {
    app.enableCors({
      origin: [...env.corsOrigins],
      credentials: true,
    });
    logger.log(`CORS enabled for: ${env.corsOrigins.join(', ')}`);
  } else {
    /**
     * Say so, loudly.
     *
     * With no origins configured, `enableCors` is skipped and every browser
     * request is refused **by the browser**, so nothing reaches the server and
     * nothing appears in its log. That is indistinguishable from a broken
     * front-end and it cost real time to diagnose once already. In production
     * this is a legitimate configuration — the web application may be served
     * same-origin — so it is a warning rather than a refusal to start.
     */
    logger.warn(
      'CORS is disabled: CORS_ORIGINS is not set. Browser requests from another ' +
        'origin will be refused by the browser before reaching this service.',
    );
  }

  // Allows in-flight requests to complete on redeploy rather than being severed.
  app.enableShutdownHooks();

  /**
   * Terminal not-found handler.
   *
   * A request matching no route never enters the Nest pipeline, so the global
   * exception filter never sees it and Express answers with its own HTML page —
   * which announces the framework and the exact path probed.
   *
   * This must be registered AFTER `init()`, because that is when Nest mounts its
   * router; middleware added before it would run ahead of the router and
   * intercept every request. It uses the same builder as the filter so an
   * unmatched route is indistinguishable from a matched route that found
   * nothing (PRD Requirement 14.3).
   */
  await app.init();
  app
    .getHttpAdapter()
    .getInstance()
    .use((request: Request, response: Response) => {
      const requestId = resolveRequestId(request.header('x-request-id'));
      response
        .status(HttpStatus.NOT_FOUND)
        .json(buildErrorResponse(HttpStatus.NOT_FOUND, requestId));
    });

  await app.listen(env.port);
  logger.log(`API listening on port ${env.port} at /api/v1`);
}

await bootstrap();
