import { HttpStatus } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Request, Response } from 'express';

import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import {
  buildErrorResponse,
  resolveRequestId,
} from './common/error-response.js';
import { loadEnvironment } from './config/environment.js';

async function bootstrap(): Promise<void> {
  const env = loadEnvironment();

  const app = await NestFactory.create(AppModule, {
    // Request bodies are capped per PRD §14.3. Applied at creation so it holds
    // for every route, including any added later without thinking about it.
    bodyParser: true,
  });

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
}

await bootstrap();
