import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { MemberMessagesController, SmsController } from './sms.controller.js';
import { SmsService } from './sms.service.js';
import { TermiiClient } from './termii.client.js';

/**
 * PRD §19 module — notifications (item 45): text messages to members.
 *
 * Imports `PaymentsModule` for `DuesService`, to say what a member still owes
 * when a confirmation goes. The payments module queues confirmations through
 * the plain function `queuePaymentNotice`, so it does not import this module
 * back. Only `TermiiClient` knows the provider.
 */
@Module({
  imports: [AuditModule, AuthModule, PaymentsModule],
  controllers: [SmsController, MemberMessagesController],
  providers: [TermiiClient, SmsService],
  exports: [SmsService],
})
export class NotificationsModule {}
