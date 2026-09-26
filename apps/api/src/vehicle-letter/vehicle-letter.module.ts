import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { MediaModule } from '../media/media.module.js';
import { VehicleLetterController } from './vehicle-letter.controller.js';
import { VehicleLetterService } from './vehicle-letter.service.js';

/**
 * The vehicle letter (PRD Requirement 9A.6, item 18).
 *
 * Exports the service for `StickerModule`, which issues a letter inside each
 * attachment's transaction. Imports `MediaModule` for the officer signatures
 * composited at download, as `CardModule` does.
 */
@Module({
  imports: [AuditModule, AuthModule, MediaModule],
  controllers: [VehicleLetterController],
  providers: [VehicleLetterService],
  exports: [VehicleLetterService],
})
export class VehicleLetterModule {}
