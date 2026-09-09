import { Global, Module } from '@nestjs/common';

import { AuditService } from './audit.service.js';

/**
 * The audit trail (domain rule 6, PRD §18).
 *
 * Global for the same reason as `PrismaModule`: every module that mutates state
 * must record it, and requiring each to import this one first is an obstacle
 * placed in front of the thing that must never be skipped.
 *
 * Reading the trail is a separate concern with its own permission
 * (`audit.read`) and is not exposed here; it arrives with the administration
 * interface.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
