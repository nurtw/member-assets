import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  activateOpenApplications,
  assessActivation,
} from '../scripts/activate-open-applications/activation.ts';

/**
 * Item 61. Every call is scoped to the application ids this suite made, because
 * the local database may hold real open applications this suite must never reach.
 */
describe('Making the open applications members (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let unitId: string;
  let startedAt: Date;
  const tag = `acttest-${randomUUID().slice(0, 8)}`;
  const made = { members: [] as string[], applications: [] as string[] };

  const open = async (
    name: string,
    status: 'DRAFT' | 'SUBMITTED' | 'APPROVED',
    memberStatus: 'PENDING' | 'ACTIVE' = 'PENDING',
  ) => {
    const member = await prisma.member.create({
      data: {
        surname: `${tag}-${name}`,
        firstName: 'Synthetic',
        status: memberStatus,
        membershipNumber: memberStatus === 'ACTIVE' ? `${tag}-${name}`.toUpperCase() : null,
        organisationId: unitId,
      },
    });
    const application = await prisma.membershipApplication.create({
      data: {
        applicationNumber: `${tag}-${name}`.toUpperCase(),
        status,
        memberId: member.id,
      },
    });
    made.members.push(member.id);
    made.applications.push(application.id);
    return { member, application };
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
    unitId = (await prisma.organisation.findFirstOrThrow({ where: { level: 'UNIT' } })).id;
    startedAt = new Date();
  });

  afterEach(async () => {
    await prisma.auditEvent.deleteMany({ where: { subjectId: { in: made.applications } } });
    await prisma.membershipApplication.deleteMany({ where: { id: { in: made.applications } } });
    await prisma.member.deleteMany({ where: { id: { in: made.members } } });
    made.members = [];
    made.applications = [];
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({
      where: { createdAt: { gte: startedAt }, reason: { contains: 'open applications become active' } },
    });
    await app.close();
  });

  it('a dry run counts what is open by kind and changes nothing', async () => {
    const draft = await open('Draft', 'DRAFT');
    const submitted = await open('Submitted', 'SUBMITTED');
    await open('Done', 'APPROVED', 'ACTIVE');
    const scope = { applicationIds: made.applications };

    const assessment = await assessActivation(prisma, scope);

    expect(assessment.counts).toEqual({ draft: 1, submitted: 1, underReview: 0 });
    expect(assessment.applicationIds).toHaveLength(2);
    expect(assessment.alreadyApproved).toBe(1);
    expect(
      (await prisma.member.findUniqueOrThrow({ where: { id: draft.member.id } })).status,
    ).toBe('PENDING');
    expect(
      (await prisma.membershipApplication.findUniqueOrThrow({ where: { id: submitted.application.id } }))
        .status,
    ).toBe('SUBMITTED');
  });

  it('makes each a member with a number, approves the application, and audits it', async () => {
    const draft = await open('Draft', 'DRAFT');
    const submitted = await open('Submitted', 'SUBMITTED');
    const done = await open('Done', 'APPROVED', 'ACTIVE');
    const scope = { applicationIds: made.applications };

    const result = await activateOpenApplications(prisma, scope);
    expect(result.activated).toBe(2);

    for (const row of [draft, submitted]) {
      const member = await prisma.member.findUniqueOrThrow({ where: { id: row.member.id } });
      expect(member.status).toBe('ACTIVE');
      expect(member.membershipNumber).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]$/);
      const application = await prisma.membershipApplication.findUniqueOrThrow({
        where: { id: row.application.id },
      });
      expect(application.status).toBe('APPROVED');
      // The membership fee is owed from here.
      expect(application.reviewedAt).not.toBeNull();
      const audit = await prisma.auditEvent.findFirst({
        where: { action: 'member.register', subjectId: application.id },
      });
      expect(audit).not.toBeNull();
    }

    // One already approved: not touched, and its number is its own.
    const untouched = await prisma.member.findUniqueOrThrow({ where: { id: done.member.id } });
    expect(untouched.membershipNumber).toBe(`${tag}-Done`.toUpperCase());
  });

  it('is safe to run twice: a second run finds nothing open', async () => {
    await open('Once', 'DRAFT');
    const scope = { applicationIds: made.applications };

    expect((await activateOpenApplications(prisma, scope)).activated).toBe(1);
    expect((await assessActivation(prisma, scope)).applicationIds).toHaveLength(0);
    expect((await activateOpenApplications(prisma, scope)).activated).toBe(0);
  });

  it('leaves a pending member with no application alone', async () => {
    const stray = await prisma.member.create({
      data: {
        surname: `${tag}-Stray`,
        firstName: 'Synthetic',
        status: 'PENDING',
        organisationId: unitId,
      },
    });
    made.members.push(stray.id);

    await activateOpenApplications(prisma, { applicationIds: [] });

    expect(
      (await prisma.member.findUniqueOrThrow({ where: { id: stray.id } })).status,
    ).toBe('PENDING');
  });
});
