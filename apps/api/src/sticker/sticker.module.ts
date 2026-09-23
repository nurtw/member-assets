import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { StickerController } from './sticker.controller.js';
import { StickerService } from './sticker.service.js';

/**
 * PRD §19 module — vehicle sticker (item 08).
 *
 * Imports `AuthModule` for `PermissionService`: `attach()` re-resolves the
 * target vehicle's own organisation path, the same reasoning `VehicleModule`
 * documents.
 */
@Module({
  imports: [AuditModule, AuthModule],
  controllers: [StickerController],
  providers: [StickerService],
  exports: [StickerService],
})
export class StickerModule {}
