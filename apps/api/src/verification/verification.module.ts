import { Module } from '@nestjs/common';

import { ApiClientModule } from '../api-client/api-client.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { StickerModule } from '../sticker/sticker.module.js';
import { ExternalVerificationController } from './external-verification.controller.js';
import { ExternalVerificationService } from './external-verification.service.js';
import { MembershipVerificationService } from './membership-verification.service.js';
import { VerificationRecordsService } from './verification-records.service.js';
import { VerificationController } from './verification.controller.js';
import { VerificationService } from './verification.service.js';

/**
 * PRD §19 module — verification, internal (items 10, 24) and external
 * (item 12). Both channels read through `VerificationRecordsService` and
 * decide with the same rule.
 *
 * Uses `StickerModule` for the signature check alone, `PaymentsModule` for
 * the dues shown beside an internal result (Requirement 27.8), and
 * `ApiClientModule` for the external request log. It holds no write path of
 * its own.
 */
@Module({
  imports: [
    AuditModule,
    AuthModule,
    StickerModule,
    PaymentsModule,
    ApiClientModule,
  ],
  controllers: [VerificationController, ExternalVerificationController],
  providers: [
    VerificationRecordsService,
    VerificationService,
    MembershipVerificationService,
    ExternalVerificationService,
  ],
})
export class VerificationModule {}
