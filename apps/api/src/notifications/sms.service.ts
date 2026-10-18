import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type {
  MemberSmsMessages,
  SmsChannel,
  SmsMessageSummary,
  SmsSettingsState,
  UpdateSmsSettingsInput,
  UpdateSmsTemplateInput,
} from '@nurtw/contracts';
import {
  SMS_STALE_AFTER_MS,
  SMS_TEMPLATE_DEFAULTS,
  SMS_TEMPLATE_KEYS,
  nextSmsAttempt,
  renderSmsTemplate,
  smsDate,
  smsDeliveryOutcome,
  smsLastFour,
  smsNaira,
  smsRecipient,
  type SmsTemplateKey,
} from '@nurtw/domain';
import { Prisma, type SmsMessage } from '@prisma/client';

import { AuditService } from '../audit/audit.service.js';
import { PermissionService } from '../auth/permission.service.js';
import { loadEnvironment } from '../config/environment.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import { DuesService } from '../payments/dues.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  SMS_CHANNEL,
  SMS_ENABLED,
  SMS_SENDER_ID,
  SettingsService,
} from '../settings/settings.service.js';
import {
  SmsProviderUnavailableError,
  SmsRefusedError,
  TermiiClient,
} from './termii.client.js';

/** How often the outbox is drained. A confirmation should arrive while the payer is still there. */
const DRAIN_INTERVAL_MS = 15_000;

/** How many messages one drain sends. */
const DRAIN_BATCH = 20;

/** A message left `SENDING` this long (the process stopped mid-send) is tried again. */
const STUCK_AFTER_MS = 10 * 60 * 1000;

/** How many messages a member's record lists. */
const MEMBER_MESSAGES = 20;

const DEFAULT_SENDER_ID = 'NURTW';
const DEFAULT_CHANNEL: SmsChannel = 'dnd';

/** What a test message says. Fixed: it proves the route, not the words. */
const TEST_TEXT =
  'NURTW: a test message from the membership system. No action is needed.';

/**
 * Text messages to members (item 45; PRD Requirement 27.14, revision 1.18;
 * `QUESTIONS.md` PAY-22, GOV-22).
 *
 * A payment credited to a member queues a confirmation in the same
 * transaction (`queuePaymentNotice`). This service drains the queue: it makes
 * the message up from what is true when it goes (the amount, and what the
 * member still owes), sends it through `TermiiClient`, retries while the
 * provider is unavailable, and records the provider's delivery reports.
 *
 * Nothing is sent while messages are switched off: what was queued is marked
 * not sent, so switching them on later sends no backlog of old receipts. A
 * message never carries a NIN, an address, or a whole number (the template
 * placeholders allow none), and the whole number is never stored.
 */
@Injectable()
export class SmsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SmsService.name);
  private drainTimer: NodeJS.Timeout | undefined;
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly dues: DuesService,
    private readonly termii: TermiiClient,
  ) {}

  onModuleInit(): void {
    // Not under test: a suite drains the outbox itself, when it chooses.
    if (loadEnvironment().nodeEnv === 'test') {
      return;
    }
    this.drainTimer = setInterval(() => {
      if (this.draining) {
        return;
      }
      this.draining = true;
      void this.drain()
        .catch((error: unknown) =>
          this.logger.error(`SMS drain failed: ${String(error)}`),
        )
        .finally(() => {
          this.draining = false;
        });
    }, DRAIN_INTERVAL_MS);
    this.drainTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.drainTimer) {
      clearInterval(this.drainTimer);
    }
  }

  // --- Settings ---------------------------------------------------------------

  /** `GET /notifications/sms`. Says which parts of the provider are configured, never their values. */
  async state(): Promise<SmsSettingsState> {
    const [enabled, senderId, channel, templates] = await Promise.all([
      this.settings.isEnabled(SMS_ENABLED),
      this.senderId(),
      this.channel(),
      Promise.all(SMS_TEMPLATE_KEYS.map((key) => this.template(key))),
    ]);
    return {
      enabled,
      senderId,
      channel,
      provider: this.termii.configuration(),
      templates: templates.map((template) => ({
        key: template.key,
        label: SMS_TEMPLATE_DEFAULTS[template.key].label,
        body: template.body,
        version: template.version,
        updatedAt: template.updatedAt?.toISOString() ?? null,
      })),
    };
  }

  /**
   * `PUT /notifications/sms/settings`. Messages cannot be switched on until
   * the provider is configured: they would only pile up unsent.
   */
  async updateSettings(
    actor: ActorContext,
    input: UpdateSmsSettingsInput,
  ): Promise<SmsSettingsState> {
    const before = await this.state();
    if (input.enabled === true && !this.termii.canSend()) {
      throw new ConflictException('The SMS provider is not configured.');
    }
    const changes: [string, string][] = [];
    if (input.enabled !== undefined && input.enabled !== before.enabled) {
      changes.push([SMS_ENABLED, String(input.enabled)]);
    }
    if (input.senderId !== undefined && input.senderId !== before.senderId) {
      changes.push([SMS_SENDER_ID, input.senderId]);
    }
    if (input.channel !== undefined && input.channel !== before.channel) {
      changes.push([SMS_CHANNEL, input.channel]);
    }
    if (changes.length === 0) {
      return before;
    }

    await this.prisma.$transaction(async (tx) => {
      for (const [key, value] of changes) {
        await tx.systemSetting.upsert({
          where: { key },
          create: { key, value, updatedByUserId: actor.userId },
          update: { value, updatedByUserId: actor.userId },
        });
      }
      await this.audit.record(
        {
          action: 'sms.settings.update',
          subjectType: 'system_setting',
          actorUserId: actor.userId,
          before: {
            enabled: before.enabled,
            senderId: before.senderId,
            channel: before.channel,
          },
          after: {
            enabled: input.enabled ?? before.enabled,
            senderId: input.senderId ?? before.senderId,
            channel: input.channel ?? before.channel,
          },
          reason: input.reason,
          requestId: actor.requestId ?? null,
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );
    });
    return this.state();
  }

  /** `PUT /notifications/sms/templates/:key`. A change is a new version; earlier ones are kept. */
  async updateTemplate(
    actor: ActorContext,
    key: SmsTemplateKey,
    input: UpdateSmsTemplateInput,
  ): Promise<SmsSettingsState> {
    const before = await this.template(key);
    if (before.body === input.body) {
      return this.state();
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        const created = await tx.smsTemplate.create({
          data: {
            key,
            version: before.version + 1,
            body: input.body,
            createdByUserId: actor.userId,
            reason: input.reason,
          },
        });
        await this.audit.record(
          {
            action: 'sms.template.update',
            subjectType: 'sms_template',
            subjectId: created.id,
            actorUserId: actor.userId,
            before: { key, version: before.version, body: before.body },
            after: { key, version: created.version, body: created.body },
            reason: input.reason,
            requestId: actor.requestId ?? null,
            ipAddress: actor.ipAddress ?? null,
          },
          tx,
        );
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Two officers saved at once; the other's version stands.
        throw new ConflictException('The words were changed a moment ago.');
      }
      throw error;
    }
    return this.state();
  }

  /**
   * `POST /notifications/sms/test`: one message, sent at once, to a number an
   * administrator typed, whether or not messages are switched on. It proves
   * the key, the sender name, and the route before members depend on them.
   */
  async sendTest(
    actor: ActorContext,
    phone: string,
  ): Promise<SmsMessageSummary> {
    const recipient = smsRecipient(phone);
    if (!recipient) {
      throw new ConflictException(
        'That number cannot be read as a Nigerian mobile number.',
      );
    }
    if (!this.termii.canSend()) {
      throw new ServiceUnavailableException(
        'The SMS provider is not configured.',
      );
    }
    const [from, channel] = await Promise.all([
      this.senderId(),
      this.channel(),
    ]);
    const now = new Date();
    let outcome: Pick<
      SmsMessage,
      'status' | 'failure' | 'providerMessageId' | 'sentAt'
    >;
    try {
      const { messageId } = await this.termii.send({
        to: recipient,
        text: TEST_TEXT,
        from,
        channel,
      });
      outcome = {
        status: 'SENT',
        failure: null,
        providerMessageId: messageId,
        sentAt: now,
      };
    } catch (error) {
      outcome = {
        status: 'FAILED',
        failure: error instanceof SmsRefusedError ? 'REFUSED' : 'UNAVAILABLE',
        providerMessageId: null,
        sentAt: null,
      };
    }
    const message = await this.prisma.smsMessage.create({
      data: {
        purpose: 'TEST',
        attempts: 1,
        recipientLastFour: smsLastFour(recipient),
        text: TEST_TEXT,
        requestedByUserId: actor.userId,
        ...outcome,
      },
    });
    await this.audit.record({
      action: 'sms.test',
      subjectType: 'sms_message',
      subjectId: message.id,
      actorUserId: actor.userId,
      after: {
        recipientLastFour: message.recipientLastFour,
        status: message.status,
        failure: message.failure,
        senderId: from,
        channel,
      },
      requestId: actor.requestId ?? null,
      ipAddress: actor.ipAddress ?? null,
    });
    return this.toSummary(message);
  }

  // --- A member's messages -------------------------------------------------------

  /** `GET /members/:id/messages`. Out of scope answers 404, like no such member. */
  async listForMember(
    userId: string,
    memberId: string,
  ): Promise<MemberSmsMessages> {
    await this.memberInScope(userId, memberId, 'payment.read');
    const [messages, enabled] = await Promise.all([
      this.prisma.smsMessage.findMany({
        where: { memberId },
        orderBy: { createdAt: 'desc' },
        take: MEMBER_MESSAGES,
      }),
      this.settings.isEnabled(SMS_ENABLED),
    ]);
    return {
      messages: messages.map((message) => this.toSummary(message)),
      sending: enabled && this.termii.canSend(),
    };
  }

  /**
   * `POST /members/:id/messages/:messageId/resend`. If no message means not
   * paid, a lost one becomes a dispute at the park, so an officer can send a
   * confirmation again. It is made up afresh, from what is true now.
   */
  async resend(
    actor: ActorContext,
    memberId: string,
    messageId: string,
  ): Promise<SmsMessageSummary> {
    await this.memberInScope(actor.userId, memberId, 'payment.initiate');
    const original = await this.prisma.smsMessage.findFirst({
      where: { id: messageId, memberId, purpose: 'PAYMENT_RECEIVED' },
    });
    if (!original) {
      throw new NotFoundException();
    }
    if (
      !(await this.settings.isEnabled(SMS_ENABLED)) ||
      !this.termii.canSend()
    ) {
      throw new ConflictException('Messages are switched off.');
    }
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.smsMessage.create({
        data: {
          memberId,
          purpose: original.purpose,
          sourceType: original.sourceType,
          sourceId: original.sourceId,
          resendOfId: original.resendOfId ?? original.id,
          requestedByUserId: actor.userId,
        },
      });
      await this.audit.record(
        {
          action: 'sms.resend',
          subjectType: 'sms_message',
          subjectId: created.id,
          actorUserId: actor.userId,
          after: { memberId, resendOf: created.resendOfId },
          requestId: actor.requestId ?? null,
          ipAddress: actor.ipAddress ?? null,
        },
        tx,
      );
      return created;
    });
    return this.toSummary(message);
  }

  // --- Sending -----------------------------------------------------------------

  /**
   * Sends what is due in the outbox. Runs every 15 seconds; safe to run
   * twice at once, because each message is claimed before it is sent.
   * Returns how many messages it handed to the provider.
   */
  async drain(now = new Date()): Promise<number> {
    await this.prisma.smsMessage.updateMany({
      where: {
        status: 'QUEUED',
        createdAt: { lt: new Date(now.getTime() - SMS_STALE_AFTER_MS) },
      },
      data: { status: 'EXPIRED' },
    });
    await this.prisma.smsMessage.updateMany({
      where: {
        status: 'SENDING',
        updatedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) },
      },
      data: { status: 'QUEUED' },
    });

    if (!(await this.settings.isEnabled(SMS_ENABLED))) {
      await this.prisma.smsMessage.updateMany({
        where: { status: 'QUEUED' },
        data: { status: 'NOT_SENT', failure: 'SWITCHED_OFF' },
      });
      return 0;
    }
    if (!this.termii.canSend()) {
      return 0; // Left queued: the settings screen says what is missing.
    }

    const claimed = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE sms_message SET status = 'SENDING', attempts = attempts + 1, updated_at = ${now}
      WHERE id IN (
        SELECT id FROM sms_message
        WHERE status = 'QUEUED' AND next_attempt_at <= ${now}
        ORDER BY created_at
        LIMIT ${DRAIN_BATCH}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id`;

    let sent = 0;
    for (const { id } of claimed) {
      try {
        if (await this.sendOne(id, now)) {
          sent += 1;
        }
      } catch (error) {
        // One message's failure must not hold up the rest.
        this.logger.error(`SMS ${id} not sent: ${String(error)}`);
      }
    }
    return sent;
  }

  /** Makes one claimed message up and sends it. `true` when the provider took it. */
  private async sendOne(id: string, now: Date): Promise<boolean> {
    const message = await this.prisma.smsMessage.findUniqueOrThrow({
      where: { id },
      include: {
        member: {
          select: {
            membershipNumber: true,
            contact: { select: { phone: true } },
          },
        },
      },
    });
    const notice = message.memberId ? await this.paymentNotice(message) : null;
    if (!message.member || !notice) {
      await this.finish(id, { status: 'FAILED', failure: 'NO_SOURCE' });
      return false;
    }

    const owed = (
      await this.dues.memberOutstanding(message.memberId!, now)
    ).dues.reduce((sum, due) => sum + due.outstandingKobo, 0);
    const template = await this.template(
      owed > 0 ? 'payment_received' : 'payment_received_clear',
    );
    const text = renderSmsTemplate(template.body, {
      amount: smsNaira(notice.amountKobo),
      member: message.member.membershipNumber ?? 'pending',
      date: smsDate(notice.at),
      owed: smsNaira(owed),
    });
    const made = {
      text,
      templateKey: template.key,
      templateVersion: template.version,
    };

    const phone = message.member.contact?.phone ?? null;
    const recipient = smsRecipient(phone);
    if (!recipient) {
      await this.finish(id, {
        ...made,
        status: 'UNSENDABLE',
        failure: phone ? 'UNREADABLE_NUMBER' : 'NO_NUMBER',
      });
      return false;
    }

    const [from, channel] = await Promise.all([
      this.senderId(),
      this.channel(),
    ]);
    try {
      const { messageId } = await this.termii.send({
        to: recipient,
        text,
        from,
        channel,
      });
      await this.finish(id, {
        ...made,
        status: 'SENT',
        failure: null,
        recipientLastFour: smsLastFour(recipient),
        providerMessageId: messageId,
        sentAt: new Date(),
      });
      return true;
    } catch (error) {
      if (error instanceof SmsProviderUnavailableError) {
        const next = nextSmsAttempt(message.attempts, now);
        await this.finish(id, {
          ...made,
          recipientLastFour: smsLastFour(recipient),
          ...(next
            ? { status: 'QUEUED', nextAttemptAt: next, failure: 'UNAVAILABLE' }
            : { status: 'FAILED', failure: 'UNAVAILABLE' }),
        });
        return false;
      }
      if (error instanceof SmsRefusedError) {
        await this.finish(id, {
          ...made,
          recipientLastFour: smsLastFour(recipient),
          status: 'FAILED',
          failure: 'REFUSED',
        });
        return false;
      }
      throw error;
    }
  }

  private async finish(
    id: string,
    data: Prisma.SmsMessageUpdateInput,
  ): Promise<void> {
    await this.prisma.smsMessage.update({ where: { id }, data });
  }

  /** What was paid and when: what the member recognises from their own side. */
  private async paymentNotice(
    message: Pick<SmsMessage, 'sourceType' | 'sourceId'>,
  ): Promise<{ amountKobo: number; at: Date } | null> {
    if (!message.sourceId) {
      return null;
    }
    if (message.sourceType === 'payment') {
      const payment = await this.prisma.payment.findUnique({
        where: { id: message.sourceId },
        select: { status: true, totalChargedKobo: true, confirmedAt: true },
      });
      return payment?.status === 'CONFIRMED'
        ? {
            amountKobo: payment.totalChargedKobo,
            at: payment.confirmedAt ?? new Date(),
          }
        : null;
    }
    if (message.sourceType === 'dedicated_account_transfer') {
      const transfer = await this.prisma.dedicatedAccountTransfer.findUnique({
        where: { id: message.sourceId },
        select: { amountKobo: true, receivedAt: true },
      });
      return transfer
        ? { amountKobo: transfer.amountKobo, at: transfer.receivedAt }
        : null;
    }
    return null;
  }

  // --- Delivery reports --------------------------------------------------------

  /**
   * A delivery report from the provider, already verified by its signature.
   * Updates the message it names; an unknown id is ignored. Delivered is
   * final: a later report cannot undo it.
   */
  async recordDelivery(report: {
    message_id?: unknown;
    status?: unknown;
  }): Promise<void> {
    const providerMessageId =
      typeof report.message_id === 'string' ||
      typeof report.message_id === 'number'
        ? String(report.message_id)
        : null;
    const status =
      typeof report.status === 'string' ? report.status.slice(0, 64) : null;
    if (!providerMessageId || !status) {
      return;
    }
    const outcome = smsDeliveryOutcome(status);
    await this.prisma.smsMessage.updateMany({
      where: { providerMessageId, status: { not: 'DELIVERED' } },
      data:
        outcome === 'DELIVERED'
          ? {
              status: 'DELIVERED',
              providerStatus: status,
              deliveredAt: new Date(),
              failure: null,
            }
          : outcome === 'FAILED'
            ? {
                status: 'FAILED',
                providerStatus: status,
                failure: 'NOT_DELIVERED',
              }
            : { providerStatus: status },
    });
  }

  verifyDelivery(rawBody: Buffer, signature: string | undefined): boolean {
    return this.termii.verifyDeliverySignature(rawBody, signature);
  }

  // --- Internals -------------------------------------------------------------------

  private async template(
    key: SmsTemplateKey,
  ): Promise<{
    key: SmsTemplateKey;
    body: string;
    version: number;
    updatedAt: Date | null;
  }> {
    const latest = await this.prisma.smsTemplate.findFirst({
      where: { key },
      orderBy: { version: 'desc' },
      select: { body: true, version: true, createdAt: true },
    });
    return latest
      ? {
          key,
          body: latest.body,
          version: latest.version,
          updatedAt: latest.createdAt,
        }
      : {
          key,
          body: SMS_TEMPLATE_DEFAULTS[key].body,
          version: 0,
          updatedAt: null,
        };
  }

  private async senderId(): Promise<string> {
    return (
      (await this.settings.getString(SMS_SENDER_ID))?.trim() ||
      DEFAULT_SENDER_ID
    );
  }

  private async channel(): Promise<SmsChannel> {
    const value = await this.settings.getString(SMS_CHANNEL);
    return value === 'generic' || value === 'dnd' ? value : DEFAULT_CHANNEL;
  }

  private async memberInScope(
    userId: string,
    memberId: string,
    permission: string,
  ): Promise<void> {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: { organisation: { select: { path: true } } },
    });
    if (
      !member ||
      !(await this.permissions.can(
        userId,
        permission,
        member.organisation.path,
      ))
    ) {
      throw new NotFoundException();
    }
  }

  private toSummary(message: SmsMessage): SmsMessageSummary {
    return {
      id: message.id,
      purpose: message.purpose,
      status: message.status,
      failure: message.failure,
      recipientLastFour: message.recipientLastFour,
      text: message.text,
      createdAt: message.createdAt.toISOString(),
      sentAt: message.sentAt?.toISOString() ?? null,
      deliveredAt: message.deliveredAt?.toISOString() ?? null,
      resendOf: message.resendOfId,
    };
  }
}
