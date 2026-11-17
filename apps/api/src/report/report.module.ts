import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { ReportController } from './report.controller.js';
import { ReportService } from './report.service.js';

/**
 * Counts and lists for officers (roadmap items 64 to 67). Imports `AuthModule` for
 * `PermissionService`: every count is taken inside the organisations in which the
 * caller holds the permission that opens the matching list. It writes nothing.
 */
@Module({
  imports: [AuthModule],
  controllers: [ReportController],
  providers: [ReportService],
})
export class ReportModule {}
