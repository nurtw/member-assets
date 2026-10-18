import { createHmac, randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/auth/password-hashing.js';
import { AllExceptionsFilter } from './../src/common/all-exceptions.filter.js';
import { queuePaymentNotice } from './../src/notifications/sms-outbox.js';
import { SmsService } from './../src/notifications/sms.service.js';
import {
  SmsProviderUnavailableError,
  SmsRefusedError,
  TermiiClient,
} from './../src/notifications/termii.client.js';
import { DuesService } from './../src/payments/dues.service.js';
import { PaymentsService } from './../src/payments/payments.service.js';
import { PaystackClient } from './../src/payments/paystack/paystack.client.js';
import { SMS_ENABLED, SettingsService } from './../src/settings/settings.service.js';

/**
 * Text messages to members, end to end (item 45, PRD Requirement 27.14
 * revision 1.18). Termii is never called: `TermiiClient.send` is replaced, and
 * the delivery-report signature is checked for real under a test secret.
 *
 * What carries weight: a credit queues one confirmation in its own
 * transaction, and a rollback or a replay queues none; nothing is sent while
 * switched off, nor later; a message goes to the member's number and no whole
 * number is kept; retries stop; delivery reports need the signature; officers
 * see and resend within their scope; the words are the Union's to change.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

const TAG = 'e2e-fixture-sms';
const PASSWORD = 'e2e-fixture-password-1';
const RUN = String(Date.now()).slice(-6);
const PHONE = '+2348000000045';
const SECRET = 'e2e-termii-secret';
const SMS_KEYS = ['sms.enabled', 'sms.sender_id', 'sms.channel'];
const TERMII_ENV = ['TERMII_API_KEY', 'TERMII_BASE_URL', 'TERMII_SECRET_KEY'] as const;

describe('Text messages to members (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let sms: SmsService;
  let payments: PaymentsService;
  let termii: TermiiClient;
  const cookies: Record<string, string> = {};
  let branchId: string;
  let otherBranchId: string;
  let feeTypeIds: Record<string, string>;
  let smsOn = false;
  let sent: { to: string; text: string; from: string; channel: string }[] = [];
  let sendResult: () => Promise<{ messageId: string }>;
  const envBefore: Partial<Record<(typeof TERMII_ENV)[number], string>> = {};
  let settingsBefore: { key: string; value: string; description: string | null }[] = [];

  beforeAll(async () => {
    await cleanUp();
    settingsBefore = await prisma.systemSetting.findMany({
      where: { key: { in: SMS_KEYS } },
      select: { key: true, value: true, description: true },
    });
    for (const key of TERMII_ENV) {
      envBefore[key] = process.env[key];
    }
    process.env.TERMII_API_KEY = 'e2e-termii-key';
    process.env.TERMII_BASE_URL = 'https://termii.invalid';
    process.env.TERMII_SECRET_KEY = SECRET;

    const council = await prisma.organisation.create({
      data: { name: `Council ${TAG}`, level: 'COUNCIL', path: 'placeholder' },
    });
    await prisma.organisation.update({
      where: { id: council.id },
      data: { path: `/${council.id}/` },
    });
    for (const which of ['branch', 'other'] as const) {
      const node = await prisma.organisation.create({
        data: {
          name: `${which} ${TAG}`,
          level: 'BRANCH',
          parentId: council.id,
          path: `/${council.id}/${which}`,
        },
      });
      await prisma.organisation.update({
        where: { id: node.id },
        data: { path: `/${council.id}/${node.id}/` },
      });
      if (which === 'branch') branchId = node.id;
      else otherBranchId = node.id;
    }

    const feeTypes = await prisma.feeType.findMany({ select: { id: true, code: true } });
    feeTypeIds = Object.fromEntries(feeTypes.map((feeType) => [feeType.code, feeType.id]));

    await buildUser('admin', ['system_setting.manage'], council.id);
    await buildUser('reader', ['payment.read'], branchId);
    await buildUser('payer', ['payment.read', 'payment.initiate'], branchId);
    await buildUser('outsider', ['payment.read', 'payment.initiate'], otherBranchId);
    await buildUser('bystander', ['member.read'], branchId);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer();
    sms = app.get(SmsService);
    payments = app.get(PaymentsService);
    termii = app.get(TermiiClient);

    // The switch is one row for the whole database; this suite decides it for
    // its own app, as users.e2e-spec.ts does for the second factor.
    const settings = app.get(SettingsService);
    const isEnabled = settings.isEnabled.bind(settings);
    vi.spyOn(settings, 'isEnabled').mockImplementation(async (key, fallback) =>
      key === SMS_ENABLED ? smsOn : isEnabled(key, fallback),
    );
    vi.spyOn(termii, 'send').mockImplementation(async (input) => {
      sent.push(input);
      return sendResult();
    });
    // Paystack confirms whatever the suite asks it to.
    vi.spyOn(app.get(PaystackClient), 'verifyTransaction').mockImplementation(
      async (reference: string) => {
        const payment = await prisma.payment.findUniqueOrThrow({
          where: { paystackReference: reference },
        });
        return {
          status: 'success',
          amountKobo: payment.totalChargedKobo,
          currency: 'NGN',
          reference,
          feesKobo: 0,
          channel: 'card',
          paidAt: new Date().toISOString(),
          customerCode: null,
          receiverAccountNumber: null,
          subaccountShareKobo: null,
        };
      },
    );

    for (const who of ['admin', 'reader', 'payer', 'outsider', 'bystander']) {
      cookies[who] = await login(`${who}.${TAG}@nurtw.test`);
    }
  });

  beforeEach(() => {
    smsOn = false;
    sent = [];
    sendResult = async () => ({ messageId: `msg-${randomUUID()}` });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanUp();
    await prisma.systemSetting.deleteMany({ where: { key: { in: SMS_KEYS } } });
    for (const setting of settingsBefore) {
      await prisma.systemSetting.create({ data: setting });
    }
    for (const key of TERMII_ENV) {
      if (envBefore[key] === undefined) delete process.env[key];
      else process.env[key] = envBefore[key];
    }
    await app.close();
    await prisma.$disconnect();
  });

  // --- Fixtures -------------------------------------------------------------------

  let members = 0;
  async function member(options: { phone?: string | null } = {}) {
    members += 1;
    const phone = options.phone === undefined ? PHONE : options.phone;
    return prisma.member.create({
      data: {
        surname: `Fixture${members}`,
        firstName: 'Sms',
        organisationId: branchId,
        status: 'ACTIVE',
        membershipNumber: `E2ESMS${RUN}${members}`,
        ...(phone ? { contact: { create: { phone, residentialAddress: 'Fixture address' } } } : {}),
      },
    });
  }

  /** A link payment Paystack has taken, confirmed the way the webhook confirms one. */
  async function paid(
    subject: { type: 'member' | 'vehicle'; id: string },
    feeCode = 'MEMBERSHIP',
    totalKobo = 3_053_000,
  ) {
    const payment = await prisma.payment.create({
      data: {
        feeTypeId: feeTypeIds[feeCode]!,
        subjectType: subject.type,
        subjectId: subject.id,
        dueKobo: totalKobo - 53_000,
        contractorFeeKobo: 53_000,
        totalChargedKobo: totalKobo,
        channel: 'LINK',
        status: 'PENDING',
        paystackReference: `${TAG}-${randomUUID()}`,
      },
    });
    await payments.confirm(payment.paystackReference!);
    return payment;
  }

  async function messagesFor(memberId: string) {
    return prisma.smsMessage.findMany({ where: { memberId }, orderBy: { createdAt: 'asc' } });
  }

  function sign(body: string): string {
    return createHmac('sha512', SECRET).update(body).digest('hex');
  }

  // --- Queueing -------------------------------------------------------------------

  describe('queueing a confirmation', () => {
    it('queues one for a dues payment, in its own transaction, and none on a replay', async () => {
      const driver = await member();
      const payment = await paid({ type: 'member', id: driver.id });
      await payments.confirm(payment.paystackReference!);

      const queued = await messagesFor(driver.id);
      expect(queued).toHaveLength(1);
      expect(queued[0]).toMatchObject({
        purpose: 'PAYMENT_RECEIVED',
        sourceType: 'payment',
        sourceId: payment.id,
        status: 'QUEUED',
        text: null,
      });
    });

    it("queues a levy's for the member who drives the vehicle, and nothing for a sticker fee", async () => {
      const driver = await member();
      const car = await prisma.vehicle.create({
        data: {
          plateNumberDisplay: `SMS-${RUN}`,
          plateNumberNormalized: `SMS${RUN}${members}`,
          branchId,
          status: 'ACTIVE',
          declaredByMemberId: driver.id,
        },
      });
      await paid({ type: 'vehicle', id: car.id }, 'LEVY', 707_000);
      await paid({ type: 'vehicle', id: car.id }, 'STICKER_NEW', 205_000);
      const queued = await messagesFor(driver.id);
      expect(queued).toHaveLength(1);
      expect(queued[0]!.sourceType).toBe('payment');
    });

    it('queues nothing for a credit that rolls back', async () => {
      const driver = await member();
      await expect(
        prisma.$transaction(async (tx) => {
          await queuePaymentNotice(tx, driver.id, { type: 'payment', id: randomUUID() });
          throw new Error('the credit failed');
        }),
      ).rejects.toThrow('the credit failed');
      expect(await messagesFor(driver.id)).toHaveLength(0);
    });
  });

  // --- Sending --------------------------------------------------------------------

  describe('sending', () => {
    it('sends nothing while switched off, and nothing of it once switched on', async () => {
      const driver = await member();
      await paid({ type: 'member', id: driver.id });
      await sms.drain();
      expect((await messagesFor(driver.id))[0]).toMatchObject({
        status: 'NOT_SENT',
        failure: 'SWITCHED_OFF',
      });

      smsOn = true;
      await sms.drain();
      expect(sent).toHaveLength(0);
      expect((await messagesFor(driver.id))[0]!.status).toBe('NOT_SENT');
    });

    it("goes to the member's number, says what was paid, and keeps no whole number", async () => {
      smsOn = true;
      const driver = await member();
      await paid({ type: 'member', id: driver.id });
      await sms.drain();

      const ours = sent.filter((message) => message.text.includes(driver.membershipNumber!));
      expect(ours).toHaveLength(1);
      expect(ours[0]).toMatchObject({ to: '2348000000045', from: 'NURTW', channel: 'dnd' });
      expect(ours[0]!.text).toMatch(
        new RegExp(`^NURTW: N30,530 received for member ${driver.membershipNumber} on \\d{1,2} \\w{3}\\. `),
      );

      const [message] = await messagesFor(driver.id);
      expect(message).toMatchObject({
        status: 'SENT',
        recipientLastFour: '0045',
        text: ours[0]!.text,
        templateKey: expect.stringMatching(/^payment_received/),
        attempts: 1,
      });
      expect(message!.providerMessageId).toMatch(/^msg-/);
      expect(JSON.stringify(message)).not.toContain('8000000045');
    });

    it('says what is still to pay', async () => {
      smsOn = true;
      const driver = await member();
      const dues = app.get(DuesService);
      const real = dues.memberOutstanding.bind(dues);
      const spy = vi.spyOn(dues, 'memberOutstanding').mockImplementation(async (id, now) =>
        id === driver.id
          ? ({
              dues: [
                {
                  subjectType: 'member',
                  subjectId: driver.id,
                  feeTypeCode: 'MEMBERSHIP',
                  period: '2026-10-19',
                  dueOn: new Date(),
                  outstandingKobo: 500_000,
                },
              ],
            } as never)
          : real(id, now),
      );
      await paid({ type: 'member', id: driver.id });
      await sms.drain();
      spy.mockRestore();
      const [message] = await messagesFor(driver.id);
      expect(message!.templateKey).toBe('payment_received');
      expect(message!.text).toContain('Still to pay now: N5,000.');
    });

    it('retries while the provider is unavailable, then gives up', async () => {
      smsOn = true;
      sendResult = async () => {
        throw new SmsProviderUnavailableError('down');
      };
      const driver = await member();
      await paid({ type: 'member', id: driver.id });

      let now = new Date();
      await sms.drain(now);
      let [message] = await messagesFor(driver.id);
      expect(message).toMatchObject({ status: 'QUEUED', attempts: 1, failure: 'UNAVAILABLE' });
      expect(message!.nextAttemptAt.getTime()).toBeGreaterThan(now.getTime());

      // Not before its time.
      await sms.drain(now);
      expect((await messagesFor(driver.id))[0]!.attempts).toBe(1);

      for (let attempt = 2; attempt <= 5; attempt += 1) {
        now = new Date(message!.nextAttemptAt.getTime() + 1_000);
        await sms.drain(now);
        [message] = await messagesFor(driver.id);
        expect(message!.attempts).toBe(attempt);
      }
      expect(message).toMatchObject({ status: 'FAILED', failure: 'UNAVAILABLE' });
    });

    it('takes a refusal as final', async () => {
      smsOn = true;
      sendResult = async () => {
        throw new SmsRefusedError('no');
      };
      const driver = await member();
      await paid({ type: 'member', id: driver.id });
      await sms.drain();
      await sms.drain(new Date(Date.now() + 2 * 60 * 60 * 1000));
      const [message] = await messagesFor(driver.id);
      expect(message).toMatchObject({ status: 'FAILED', failure: 'REFUSED', attempts: 1 });
    });

    it('records a member with no usable number as unsendable', async () => {
      smsOn = true;
      const none = await member({ phone: null });
      const unreadable = await member({ phone: '12345' });
      await paid({ type: 'member', id: none.id });
      await paid({ type: 'member', id: unreadable.id });
      await sms.drain();
      expect((await messagesFor(none.id))[0]).toMatchObject({
        status: 'UNSENDABLE',
        failure: 'NO_NUMBER',
      });
      expect((await messagesFor(unreadable.id))[0]).toMatchObject({
        status: 'UNSENDABLE',
        failure: 'UNREADABLE_NUMBER',
      });
      expect(sent.some((message) => message.to === '12345')).toBe(false);
    });
  });

  // --- Delivery reports -------------------------------------------------------------

  describe('delivery reports', () => {
    async function sentMessage() {
      smsOn = true;
      const driver = await member();
      await paid({ type: 'member', id: driver.id });
      await sms.drain();
      return (await messagesFor(driver.id))[0]!;
    }

    function report(body: object, signature?: string) {
      const raw = JSON.stringify(body);
      const call = request(server)
        .post('/api/v1/notifications/sms/delivery')
        .set('Content-Type', 'application/json');
      return (signature === undefined ? call : call.set('X-Termii-Signature', signature)).send(raw);
    }

    it('refuses a report without the right signature, before touching anything', async () => {
      const message = await sentMessage();
      const body = { message_id: message.providerMessageId, status: 'Delivered' };
      await report(body).expect(401);
      await report(body, sign('something else')).expect(401);
      expect((await prisma.smsMessage.findUniqueOrThrow({ where: { id: message.id } })).status).toBe(
        'SENT',
      );
    });

    it('records delivery, and a later failure cannot undo it', async () => {
      const message = await sentMessage();
      const delivered = { message_id: message.providerMessageId, status: 'DELIVERED' };
      await report(delivered, sign(JSON.stringify(delivered))).expect(200);
      let stored = await prisma.smsMessage.findUniqueOrThrow({ where: { id: message.id } });
      expect(stored.status).toBe('DELIVERED');
      expect(stored.deliveredAt).not.toBeNull();

      const failed = { message_id: message.providerMessageId, status: 'Message Failed' };
      await report(failed, sign(JSON.stringify(failed))).expect(200);
      stored = await prisma.smsMessage.findUniqueOrThrow({ where: { id: message.id } });
      expect(stored.status).toBe('DELIVERED');
    });

    it('records a failed delivery, and ignores an unknown message', async () => {
      const message = await sentMessage();
      const failed = { message_id: message.providerMessageId, status: 'Rejected' };
      await report(failed, sign(JSON.stringify(failed))).expect(200);
      expect(await prisma.smsMessage.findUniqueOrThrow({ where: { id: message.id } })).toMatchObject({
        status: 'FAILED',
        failure: 'NOT_DELIVERED',
        providerStatus: 'Rejected',
      });
      const unknown = { message_id: 'not-ours', status: 'Delivered' };
      await report(unknown, sign(JSON.stringify(unknown))).expect(200);
    });
  });

  // --- A member's messages -----------------------------------------------------------

  describe("a member's messages", () => {
    it('lists them for a reader in scope, never with the whole number', async () => {
      smsOn = true;
      const driver = await member();
      await paid({ type: 'member', id: driver.id });
      await sms.drain();

      const response = await request(server)
        .get(`/api/v1/members/${driver.id}/messages`)
        .set('Cookie', cookies.reader!)
        .expect(200);
      expect(response.body.sending).toBe(true);
      expect(response.body.messages).toHaveLength(1);
      expect(response.body.messages[0]).toMatchObject({
        purpose: 'PAYMENT_RECEIVED',
        status: 'SENT',
        recipientLastFour: '0045',
      });
      expect(JSON.stringify(response.body)).not.toContain('8000000045');

      await request(server)
        .get(`/api/v1/members/${driver.id}/messages`)
        .set('Cookie', cookies.outsider!)
        .expect(404);
      await request(server)
        .get(`/api/v1/members/${driver.id}/messages`)
        .set('Cookie', cookies.bystander!)
        .expect(403);
    });

    it('sends a confirmation again on request, made up afresh, and audited', async () => {
      smsOn = true;
      const driver = await member();
      await paid({ type: 'member', id: driver.id });
      await sms.drain();
      const [original] = await messagesFor(driver.id);

      const response = await request(server)
        .post(`/api/v1/members/${driver.id}/messages/${original!.id}/resend`)
        .set('Cookie', cookies.payer!)
        .expect(201);
      expect(response.body.message).toMatchObject({ status: 'QUEUED', resendOf: original!.id });
      await sms.drain();
      const all = await messagesFor(driver.id);
      expect(all).toHaveLength(2);
      expect(all[1]).toMatchObject({ status: 'SENT', resendOfId: original!.id });
      expect(
        await prisma.auditEvent.count({ where: { action: 'sms.resend', subjectId: all[1]!.id } }),
      ).toBe(1);

      await request(server)
        .post(`/api/v1/members/${driver.id}/messages/${original!.id}/resend`)
        .set('Cookie', cookies.reader!)
        .expect(403);
      await request(server)
        .post(`/api/v1/members/${driver.id}/messages/${original!.id}/resend`)
        .set('Cookie', cookies.outsider!)
        .expect(404);
      smsOn = false;
      await request(server)
        .post(`/api/v1/members/${driver.id}/messages/${original!.id}/resend`)
        .set('Cookie', cookies.payer!)
        .expect(409);
    });
  });

  // --- Settings ------------------------------------------------------------------------

  describe('settings', () => {
    it('says which parts of the provider are configured, never their values', async () => {
      const response = await request(server)
        .get('/api/v1/notifications/sms')
        .set('Cookie', cookies.admin!)
        .expect(200);
      expect(response.body.sms).toMatchObject({
        enabled: false,
        senderId: 'NURTW',
        channel: 'dnd',
        provider: { apiKey: true, baseUrl: true, webhookSecret: true },
      });
      expect(response.body.sms.templates.map((t: { key: string }) => t.key)).toEqual([
        'payment_received',
        'payment_received_clear',
      ]);
      expect(JSON.stringify(response.body)).not.toContain('e2e-termii');

      await request(server)
        .get('/api/v1/notifications/sms')
        .set('Cookie', cookies.payer!)
        .expect(403);
    });

    it('will not switch messages on until the provider is configured, and audits the switch', async () => {
      const canSend = vi.spyOn(termii, 'canSend').mockReturnValue(false);
      await request(server)
        .put('/api/v1/notifications/sms/settings')
        .set('Cookie', cookies.admin!)
        .send({ enabled: true, reason: 'Sender name approved' })
        .expect(409);
      canSend.mockRestore();

      await request(server)
        .put('/api/v1/notifications/sms/settings')
        .set('Cookie', cookies.admin!)
        .send({ enabled: true, channel: 'generic', reason: 'Sender name approved' })
        .expect(200);
      const stored = await prisma.systemSetting.findMany({ where: { key: { in: SMS_KEYS } } });
      expect(Object.fromEntries(stored.map((row) => [row.key, row.value]))).toMatchObject({
        'sms.enabled': 'true',
        'sms.channel': 'generic',
      });
      expect(
        await prisma.auditEvent.count({
          where: { action: 'sms.settings.update', reason: 'Sender name approved' },
        }),
      ).toBeGreaterThanOrEqual(1);
      await prisma.systemSetting.deleteMany({ where: { key: { in: SMS_KEYS } } });
    });

    it('takes new words as a new version, and refuses words a message cannot carry', async () => {
      for (const body of ['NURTW: ₦{amount} received.', 'NURTW: your NIN is {nin}.', '   ']) {
        await request(server)
          .put('/api/v1/notifications/sms/templates/payment_received_clear')
          .set('Cookie', cookies.admin!)
          .send({ body, reason: 'Union wording' })
          .expect(400);
      }
      await request(server)
        .put('/api/v1/notifications/sms/templates/not_a_message')
        .set('Cookie', cookies.admin!)
        .send({ body: 'NURTW: {amount}.', reason: 'Union wording' })
        .expect(400);

      const words = 'NURTW: we have received {amount} for {member} ({date}). Thank you.';
      const response = await request(server)
        .put('/api/v1/notifications/sms/templates/payment_received_clear')
        .set('Cookie', cookies.admin!)
        .send({ body: words, reason: 'Union wording' })
        .expect(200);
      expect(
        response.body.sms.templates.find((t: { key: string }) => t.key === 'payment_received_clear'),
      ).toMatchObject({ body: words, version: 1 });

      smsOn = true;
      const driver = await member();
      await paid({ type: 'member', id: driver.id });
      await sms.drain();
      expect((await messagesFor(driver.id))[0]).toMatchObject({
        templateKey: 'payment_received_clear',
        templateVersion: 1,
        text: expect.stringMatching(/^NURTW: we have received N30,530 for E2ESMS/),
      });
    });

    it('sends a test message at once, recording only the last four digits', async () => {
      const response = await request(server)
        .post('/api/v1/notifications/sms/test')
        .set('Cookie', cookies.admin!)
        .send({ phone: '0803 000 0046' })
        .expect(201);
      expect(response.body.message).toMatchObject({
        purpose: 'TEST',
        status: 'SENT',
        recipientLastFour: '0046',
      });
      expect(sent.at(-1)).toMatchObject({ to: '2348030000046' });
      const stored = await prisma.smsMessage.findUniqueOrThrow({
        where: { id: response.body.message.id },
      });
      expect(JSON.stringify(stored)).not.toContain('8030000046');

      await request(server)
        .post('/api/v1/notifications/sms/test')
        .set('Cookie', cookies.admin!)
        .send({ phone: '12345' })
        .expect(400);
      const canSend = vi.spyOn(termii, 'canSend').mockReturnValue(false);
      await request(server)
        .post('/api/v1/notifications/sms/test')
        .set('Cookie', cookies.admin!)
        .send({ phone: '0803 000 0046' })
        .expect(503);
      canSend.mockRestore();
    });
  });

  // --- Helpers ------------------------------------------------------------------------

  async function buildUser(
    who: string,
    permissions: readonly string[],
    organisationId: string,
  ): Promise<void> {
    const user = await prisma.user.create({
      data: {
        email: `${who}.${TAG}@nurtw.test`.toLowerCase(),
        fullName: `${who} fixture`,
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    for (const code of permissions) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { code } });
      await prisma.userPermissionGrant.create({
        data: {
          userId: user.id,
          permissionId: permission.id,
          organisationId,
          grantedByUserId: user.id,
          reason: 'e2e fixture',
        },
      });
    }
  }

  async function login(email: string): Promise<string> {
    const response = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    const raw = response.headers['set-cookie'];
    return (Array.isArray(raw) ? raw[0]! : raw!).split(';')[0]!;
  }

  async function cleanUp(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: TAG } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    const orgs = await prisma.organisation.findMany({
      where: { name: { contains: TAG } },
      select: { id: true },
      orderBy: { path: 'desc' },
    });
    const orgIds = orgs.map((org) => org.id);
    const fixturePayments = await prisma.payment.findMany({
      where: { paystackReference: { contains: TAG } },
      select: { id: true },
    });

    await prisma.auditEvent.deleteMany({
      where: {
        OR: [
          { actorUserId: { in: userIds } },
          { subjectId: { in: fixturePayments.map((payment) => payment.id) } },
        ],
      },
    });
    await prisma.smsMessage.deleteMany({ where: { requestedByUserId: { in: userIds } } });
    await prisma.smsTemplate.deleteMany({ where: { createdByUserId: { in: userIds } } });
    await prisma.ledgerEntry.deleteMany({
      where: { payment: { paystackReference: { contains: TAG } } },
    });
    await prisma.payment.deleteMany({ where: { paystackReference: { contains: TAG } } });
    await prisma.vehicle.deleteMany({ where: { branchId: { in: orgIds } } });
    await prisma.member.deleteMany({ where: { organisationId: { in: orgIds } } });
    await prisma.userPermissionGrant.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    for (const org of orgs) {
      await prisma.organisation.deleteMany({ where: { id: org.id } });
    }
  }
});
