import { Module } from '@nestjs/common';

import { DisclosureModule } from '../disclosure/disclosure.module.js';
import { ApiClientAuthService } from './api-client-auth.service.js';
import { ApiClientService } from './api-client.service.js';
import { ApiClientsController } from './api-clients.controller.js';
import { ApiRequestLogService } from './api-request-log.service.js';
import { ApiTokenService } from './api-token.service.js';

/**
 * External organisations, their tokens, and the authentication of an external
 * request (ARCHITECTURE.md §4 — item 11).
 *
 * `ApiClientAuthService` is exported for the global guard, which sends a route
 * carrying `@RequireScope` to it. `ApiRequestLogService` is exported for the
 * external routes of item 12, which record the outcome of each request.
 *
 * This module imports no provider from `AuthModule`: an API token and a
 * session share no code path and no store (Decisions 9.1 and 9.8). The
 * decorators its controller carries are metadata, read by the one guard.
 */
@Module({
  imports: [DisclosureModule],
  controllers: [ApiClientsController],
  providers: [
    ApiClientService,
    ApiTokenService,
    ApiClientAuthService,
    ApiRequestLogService,
  ],
  exports: [ApiClientAuthService, ApiRequestLogService],
})
export class ApiClientModule {}
