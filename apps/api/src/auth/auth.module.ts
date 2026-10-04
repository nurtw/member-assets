import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { ApiClientModule } from '../api-client/api-client.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { RateLimitModule } from '../rate-limit/rate-limit.module.js';
import { AccountService } from './account.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthorisationGuard } from './authorisation.guard.js';
import { PasswordService } from './password.service.js';
import { PermissionService } from './permission.service.js';
import { SessionService } from './session.service.js';

/**
 * Authentication and authorisation.
 *
 * The guard is registered as `APP_GUARD`, so it applies to **every** route in
 * the application rather than being opted into per controller. That ordering is
 * the point: a new controller added later is protected the moment it exists, and
 * must be explicitly annotated `@Public()` to be reachable without a session.
 *
 * Services are exported so other modules can ask permission questions, but the
 * guard remains the only place a decision is enforced (Decision 9.9).
 *
 * `ApiClientModule` is imported for one thing: the guard hands a route carrying
 * `@RequireScope` to its `ApiClientAuthService`, and logs what it refuses
 * there. That module imports nothing from this one, so sessions and API
 * tokens stay separate mechanisms (Decisions 9.1 and 9.8). `RateLimitModule`
 * is imported for the limits the guard applies to an external request once
 * its token is accepted (item 13).
 */
@Module({
  imports: [ApiClientModule, RateLimitModule, AuditModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AccountService,
    PasswordService,
    SessionService,
    PermissionService,
    { provide: APP_GUARD, useClass: AuthorisationGuard },
  ],
  exports: [PermissionService, SessionService, PasswordService],
})
export class AuthModule {}
