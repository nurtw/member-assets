import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { RateLimitProfilesController } from './rate-limit-profiles.controller.js';
import { RateLimitService } from './rate-limit.service.js';

/**
 * PRD §19 module — rate limiting and abuse detection (ARCHITECTURE.md §4,
 * Decisions 8.1–8.3 — item 13).
 *
 * `RateLimitService` is exported for the guard, which admits an external
 * request, and for the external request log, which reports how each check
 * turned out. It owns the limit profiles, the counters, and the pauses, and
 * nothing outside it reads them.
 *
 * It imports nothing from `ApiClientModule` or `AuthModule`: both import it.
 */
@Module({
  imports: [AuditModule],
  controllers: [RateLimitProfilesController],
  providers: [RateLimitService],
  exports: [RateLimitService],
})
export class RateLimitModule {}
