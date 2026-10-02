import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { DedicatedAccountController } from './dedicated-account.controller.js';
import { DedicatedAccountService } from './dedicated-account.service.js';
import { DuesController } from './dues.controller.js';
import { DuesService } from './dues.service.js';
import { FeeTypeService } from './fee-type.service.js';
import { FeeTypesController } from './fee-types.controller.js';
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
  controllers: [
    PaymentsController,
    FeeTypesController,
    DuesController,
    DedicatedAccountController,
  ],
  providers: [
    PaystackClient,
    FeeTypeService,
    SettlementService,
    PaymentsService,
    DuesService,
    DedicatedAccountService,
  ],
  exports: [PaymentsService, FeeTypeService, SettlementService, DuesService],
})
export class PaymentsModule {}
