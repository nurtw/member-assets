import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

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
 */
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    SessionService,
    PermissionService,
    { provide: APP_GUARD, useClass: AuthorisationGuard },
  ],
  exports: [PermissionService, SessionService, PasswordService],
})
export class AuthModule {}
