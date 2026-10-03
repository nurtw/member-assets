import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { StickerModule } from '../sticker/sticker.module.js';
import { MembershipVerificationService } from './membership-verification.service.js';
import { VerificationController } from './verification.controller.js';
import { VerificationService } from './verification.service.js';

/**
 * PRD §19 module — verification (item 10). Uses `StickerModule` for the
 * signature check alone, and `PaymentsModule` for the dues shown beside a
 * result (Requirement 27.8). It holds no write path of its own.
 */
@Module({
  imports: [AuditModule, AuthModule, StickerModule, PaymentsModule],
  controllers: [VerificationController],
  providers: [VerificationService, MembershipVerificationService],
})
export class VerificationModule {}
