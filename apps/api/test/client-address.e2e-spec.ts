import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import {
  FORWARDING_KEY_HEADER,
  VISITOR_ADDRESS_HEADER,
} from '@nurtw/contracts';

import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/auth/password-hashing.js';
import { AllExceptionsFilter } from './../src/common/all-exceptions.filter.js';
import { applyClientAddress } from './../src/common/client-address.js';

/**
 * Who is calling (item 55), as DigitalOcean delivers a request: the router
 * connects, and names in `X-Forwarded-For` the Cloudflare address it was
 * connected from, after whatever Cloudflare itself recorded. A session keeps
 * the address of the sign-in that opened it, so each test signs in and reads
 * that address back.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

const TAG = 'e2e-fixture-client-address';
const EMAIL = `officer.${TAG}@nurtw.test`;
const PASSWORD = 'e2e-fixture-password-1';
const SECRET = 'e2e-forwarding-secret-'.padEnd(48, 'x');
const CLOUDFLARE = '172.71.122.156';

describe('The caller’s address (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyClientAddress(app.getHttpAdapter().getInstance(), {
      edgeProxy: 'cloudflare',
      webForwardingSecret: SECRET,
    });
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer();

    await cleanUp();
    const user = await prisma.user.create({
      data: {
        email: EMAIL,
        fullName: 'Client address fixture',
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
    await prisma.$disconnect();
  });

  it('records a direct caller, the address before the one Cloudflare hop', async () => {
    expect(
      await signInFrom({ 'X-Forwarded-For': `203.0.113.7, ${CLOUDFLARE}` }),
    ).toBe('203.0.113.7');
  });

  it('never believes an address the caller wrote earlier in the header', async () => {
    expect(
      await signInFrom({
        'X-Forwarded-For': `192.0.2.1, 203.0.113.7, ${CLOUDFLARE}`,
      }),
    ).toBe('203.0.113.7');
  });

  it('trusts no hop the router names that is not Cloudflare', async () => {
    expect(
      await signInFrom({ 'X-Forwarded-For': '203.0.113.7, 198.51.100.99' }),
    ).toBe('198.51.100.99');
  });

  it('records the visitor the website names with the shared secret', async () => {
    expect(
      await signInFrom({
        'X-Forwarded-For': `34.120.1.2, ${CLOUDFLARE}`,
        [FORWARDING_KEY_HEADER]: SECRET,
        [VISITOR_ADDRESS_HEADER]: '198.51.100.23',
      }),
    ).toBe('198.51.100.23');
  });

  it('ignores a named visitor without the right secret', async () => {
    expect(
      await signInFrom({
        'X-Forwarded-For': `34.120.1.2, ${CLOUDFLARE}`,
        [FORWARDING_KEY_HEADER]: 'a-guess-at-the-secret',
        [VISITOR_ADDRESS_HEADER]: '198.51.100.23',
      }),
    ).toBe('34.120.1.2');
    expect(
      await signInFrom({
        'X-Forwarded-For': `34.120.1.2, ${CLOUDFLARE}`,
        [VISITOR_ADDRESS_HEADER]: '198.51.100.23',
      }),
    ).toBe('34.120.1.2');
  });

  /** Signs in with these headers; the address the new session recorded. */
  async function signInFrom(
    headers: Record<string, string>,
  ): Promise<string | null> {
    await request(server)
      .post('/api/v1/auth/login')
      .set(headers)
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    const session = await prisma.userSession.findFirstOrThrow({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { ipAddress: true },
    });
    return session.ipAddress;
  }

  async function cleanUp(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: TAG } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    await prisma.auditEvent.deleteMany({
      where: { actorUserId: { in: userIds } },
    });
    await prisma.userSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});
