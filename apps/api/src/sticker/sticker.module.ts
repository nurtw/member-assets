import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { VehicleLetterModule } from '../vehicle-letter/vehicle-letter.module.js';
import { StickerController } from './sticker.controller.js';
import { StickerService } from './sticker.service.js';

/**
 * PRD §19 module — vehicle sticker (item 08).
 *
 * Imports `AuthModule` for `PermissionService`: `attach()` re-resolves the
 * target vehicle's own organisation path, the same reasoning `VehicleModule`
 * documents. Imports `VehicleLetterModule`: an attachment issues its letter
 * in the same transaction (item 18). Imports `PaymentsModule` for
 * `FeeTypeService`: what a sticker costs decides whether a payment is needed
 * (VEH-37).
 */
@Module({
  imports: [AuditModule, AuthModule, PaymentsModule, VehicleLetterModule],
  controllers: [StickerController],
  providers: [StickerService],
  exports: [StickerService],
})
export class StickerModule {}
