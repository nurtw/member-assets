import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { RolesService } from './roles.service.js';
import {
  SecuritySettingsController,
  SecuritySettingsService,
} from './security-settings.controller.js';
import { RolesController, UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

/**
 * Officer accounts, their roles, and single-permission grants and revocations
 * (PRD §16 — item 28). The administration half of ARCHITECTURE.md §4's `auth`
 * module, kept apart from it so that signing in and deciding a permission
 * depend on nothing here.
 */
@Module({
  imports: [AuditModule, AuthModule],
  controllers: [UsersController, RolesController, SecuritySettingsController],
  providers: [UsersService, RolesService, SecuritySettingsService],
})
export class UsersModule {}
