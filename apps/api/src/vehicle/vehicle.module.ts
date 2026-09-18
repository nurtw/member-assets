import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { VehicleController } from './vehicle.controller.js';
import { VehicleService } from './vehicle.service.js';

/**
 * PRD §19 module — vehicle declaration (item 07).
 *
 * Imports `AuthModule` for `PermissionService`: every method in
 * `VehicleService` asks a record-scoped permission question of its own,
 * because the guard's coarse check cannot distinguish one branch's
 * declarations from another's.
 */
@Module({
  imports: [AuditModule, AuthModule],
  controllers: [VehicleController],
  providers: [VehicleService],
  exports: [VehicleService],
})
export class VehicleModule {}
