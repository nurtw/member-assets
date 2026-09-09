import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { MediaModule } from '../media/media.module.js';
import {
  MemberController,
  MembershipController,
} from './membership.controller.js';
import { MembershipService } from './membership.service.js';

/**
 * PRD §19 module — membership registration.
 *
 * Imports `AuthModule` for `PermissionService`: every method in this service
 * asks a record-scoped permission question of its own, because the guard's
 * coarse check cannot distinguish one branch's applicants from another's.
 */
@Module({
  imports: [AuthModule, MediaModule],
  controllers: [MembershipController, MemberController],
  providers: [MembershipService],
  exports: [MembershipService],
})
export class MembershipModule {}
