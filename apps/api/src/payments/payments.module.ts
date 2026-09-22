import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { FeeTypeService } from './fee-type.service.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { PaystackClient } from './paystack/paystack.client.js';
import { SettlementService } from './settlement.service.js';

/**
 * PRD §19 module — payments (item 16). The only module that talks to
 * Paystack; onboarding (item 17) consumes payment confirmation through
 * `PaymentsService`, not by calling Paystack itself.
 */
@Module({
  imports: [AuditModule, AuthModule],
  controllers: [PaymentsController],
  providers: [
    PaystackClient,
    FeeTypeService,
    SettlementService,
    PaymentsService,
  ],
  exports: [PaymentsService, FeeTypeService, SettlementService],
})
export class PaymentsModule {}
