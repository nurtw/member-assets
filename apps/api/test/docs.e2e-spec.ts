import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/auth/password-hashing.js';
import { AllExceptionsFilter } from './../src/common/all-exceptions.filter.js';

/**
 * The API reference, in two parts (item 54, the owner's direction of 19
 * October 2026).
 *
 * - The integration reference is public: an organisation reads it before it
 *   has a token. It describes the routes that name a scope, and nothing else.
 * - The whole map of routes, with what each requires, goes only to a holder
 *   of `docs.read_internal`. An officer who holds other permissions, even one
 *   who may read every organisation, is refused it.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

const TAG = 'e2e-fixture-docs';
const PASSWORD = 'e2e-fixture-password-1';

describe('API reference access (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let officer: string;
  let reader: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer();

    await cleanUp();
    officer = await signInWith('officer', ['organisation.read', 'user.read']);
    reader = await signInWith('reader', ['docs.read_internal']);
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
    await prisma.$disconnect();
  });

  it('gives anyone the integration reference, and only the routes that name a scope', async () => {
    const response = await request(server)
      .get('/api/v1/docs/integration.json')
      .expect(200);

    expect(response.headers['cache-control']).toBe('public, max-age=300');
    expect(response.body.info.title).toBe('NURTW Verification API');
    const paths = Object.keys(response.body.paths).sort();
    expect(paths).toEqual([
      '/api/v1/aggregates/vehicles',
      '/api/v1/aggregates/vehicles/total',
      '/api/v1/metadata/organisation',
      '/api/v1/verification/membership',
      '/api/v1/verification/sticker/qr',
      '/api/v1/verification/vehicle/combined',
      '/api/v1/verification/vehicle/plate',
    ]);
    expect(JSON.stringify(response.body)).not.toMatch(/Permission required/);
  });

  it('refuses the whole map to a visitor', async () => {
    const response = await request(server)
      .get('/api/v1/docs/openapi.json')
      .expect(401);
    expect(response.body.paths).toBeUndefined();
  });

  it('refuses the whole map to an officer without docs.read_internal', async () => {
    const response = await request(server)
      .get('/api/v1/docs/openapi.json')
      .set('Cookie', officer)
      .expect(403);
    expect(response.body.paths).toBeUndefined();
  });

  it('gives the whole map, officers’ routes and all, to a holder of docs.read_internal', async () => {
    const response = await request(server)
      .get('/api/v1/docs/openapi.json')
      .set('Cookie', reader)
      .expect(200);

    expect(response.body.paths['/api/v1/members']).toBeDefined();
    expect(
      response.body.paths['/api/v1/verification/vehicle/plate'],
    ).toBeDefined();
    expect(JSON.stringify(response.body)).toMatch(/Permission required/);
  });

  it('puts docs.read_internal in the super administrator’s role', async () => {
    const role = await prisma.role.findUniqueOrThrow({
      where: { code: 'SUPER_ADMINISTRATOR' },
      include: { permissions: { include: { permission: true } } },
    });
    expect(role.permissions.map((entry) => entry.permission.code)).toContain(
      'docs.read_internal',
    );
  });

  async function signInWith(
    name: string,
    permissions: string[],
  ): Promise<string> {
    const council = await prisma.organisation.findFirstOrThrow({
      where: { level: 'COUNCIL' },
    });
    const email = `${name}.${TAG}@nurtw.test`;
    const user = await prisma.user.create({
      data: {
        email,
        fullName: `${name} docs fixture`,
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    for (const code of permissions) {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { code },
      });
      await prisma.userPermissionGrant.create({
        data: {
          userId: user.id,
          permissionId: permission.id,
          organisationId: council.id,
          grantedByUserId: user.id,
          reason: 'e2e fixture',
        },
      });
    }
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
    await prisma.auditEvent.deleteMany({
      where: { actorUserId: { in: userIds } },
    });
    await prisma.userPermissionGrant.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.userSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});
