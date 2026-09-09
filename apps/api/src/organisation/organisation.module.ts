import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { OrganisationController } from './organisation.controller.js';
import { OrganisationService } from './organisation.service.js';

/**
 * PRD §19 module — organisational hierarchy.
 *
 * Imports `AuthModule` for `PermissionService`, because every method in this
 * module's service asks a record-scoped permission question of its own. The
 * global guard's coarse check is not sufficient here (Decision 9.4).
 */
@Module({
  imports: [AuthModule],
  controllers: [OrganisationController],
  providers: [OrganisationService],
  exports: [OrganisationService],
})
export class OrganisationModule {}
