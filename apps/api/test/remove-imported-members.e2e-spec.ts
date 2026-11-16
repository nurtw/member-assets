import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  RemovalBlockedError,
  assessRemoval,
  removeImportedMembers,
} from '../scripts/remove-imported-members/removal.ts';

/**
 * Item 58. Every row here carries a prefix of this suite's own, and every call is
 * scoped to it, because the local database holds the real imported members and
 * this suite must never be able to reach them.
 */
describe('Removing the imported members (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let unitId: string;
  let restoreDirectory: string;
  let startedAt: Date;
  const tag = `rmtest-${randomUUID().slice(0, 8)}-`;
  const scope = { legacyIdStartsWith: tag };
  const created = { members: [] as string[], vehicles: [] as string[], payments: [] as string[] };

  const member = async (name: string, legacy: boolean) => {
    const row = await prisma.member.create({
      data: {
        surname: name,
        firstName: 'Synthetic',
        status: 'ACTIVE',
        organisationId: unitId,
        legacyId: legacy ? `${tag}${name}` : null,
      },
    });
    created.members.push(row.id);
    return row;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
    const unit = await prisma.organisation.findFirstOrThrow({ where: { level: 'UNIT' } });
    unitId = unit.id;
    restoreDirectory = mkdtempSync(path.join(tmpdir(), 'restore-'));
    startedAt = new Date();
  });

  afterEach(async () => {
    await prisma.payment.deleteMany({ where: { id: { in: created.payments } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: created.vehicles } } });
    await prisma.memberContact.deleteMany({ where: { memberId: { in: created.members } } });
    await prisma.member.deleteMany({ where: { id: { in: created.members } } });
    created.members = [];
    created.vehicles = [];
    created.payments = [];
  });

  afterAll(async () => {
    rmSync(restoreDirectory, { recursive: true, force: true });
    await prisma.auditEvent.deleteMany({
      where: { action: 'member.imported_removed', createdAt: { gte: startedAt } },
    });
    await app.close();
  });

  it('a dry run counts what would go and changes nothing', async () => {
    const imported = await member('Imported', true);
    await prisma.memberContact.create({
      data: { memberId: imported.id, phone: '0000000000', residentialAddress: 'Synthetic address' },
    });

    const assessment = await assessRemoval(prisma, scope);

    expect(assessment.counts.members).toBe(1);
    expect(assessment.counts.contacts).toBe(1);
    expect(assessment.blocked).toBe(false);
    expect(await prisma.member.findUnique({ where: { id: imported.id } })).not.toBeNull();
  });

  it('deletes the imported member, keeps one added through the System, and unlinks only the driver', async () => {
    const imported = await member('Imported', true);
    const added = await member('Added', false);
    await prisma.memberContact.create({
      data: { memberId: imported.id, phone: '0000000000', residentialAddress: 'Synthetic address' },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        plateNumberNormalized: `RM${tag.slice(7, 13).toUpperCase()}`,
        plateNumberDisplay: 'RM TEST',
        branchId: (await prisma.organisation.findFirstOrThrow({ where: { level: 'BRANCH' } })).id,
        status: 'ON_RECORD',
        declaredByMemberId: imported.id,
      },
    });
    created.vehicles.push(vehicle.id);
    const auditBefore = await prisma.auditEvent.count({ where: { action: 'member.imported_removed' } });

    const result = await removeImportedMembers(prisma, { scope, restoreDirectory });

    expect(result.counts.members).toBe(1);
    expect(await prisma.member.findUnique({ where: { id: imported.id } })).toBeNull();
    expect(await prisma.memberContact.count({ where: { memberId: imported.id } })).toBe(0);
    expect(await prisma.member.findUnique({ where: { id: added.id } })).not.toBeNull();
    const kept = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
    expect(kept.declaredByMemberId).toBeNull();
    expect(kept.plateNumberDisplay).toBe('RM TEST');

    const events = await prisma.auditEvent.findMany({
      where: { action: 'member.imported_removed' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    expect(await prisma.auditEvent.count({ where: { action: 'member.imported_removed' } })).toBe(auditBefore + 1);
    expect(JSON.stringify(events[0]!.afterValue)).not.toContain('Imported');
  });

  it('writes the restore point before it deletes, and the file holds the rows', async () => {
    const imported = await member('Restorable', true);

    const result = await removeImportedMembers(prisma, { scope, restoreDirectory });

    expect(existsSync(result.restorePoint)).toBe(true);
    const body = JSON.parse(readFileSync(result.restorePoint, 'utf8'));
    expect(body.members.map((m: { id: string }) => m.id)).toContain(imported.id);
  });

  it('refuses, and deletes nothing, when an imported member holds a payment', async () => {
    const imported = await member('Paid', true);
    const feeType = await prisma.feeType.findFirstOrThrow();
    const payment = await prisma.payment.create({
      data: {
        feeTypeId: feeType.id,
        subjectType: 'member',
        subjectId: imported.id,
        dueKobo: 100,
        contractorFeeKobo: 0,
        totalChargedKobo: 100,
        channel: 'LINK',
        paystackReference: `${tag}ref`,
      },
    });
    created.payments.push(payment.id);

    await expect(
      removeImportedMembers(prisma, { scope, restoreDirectory }),
    ).rejects.toBeInstanceOf(RemovalBlockedError);

    expect(await prisma.member.findUnique({ where: { id: imported.id } })).not.toBeNull();
  });

  it('never reaches a member outside the scope it was given', async () => {
    const outside = await member('Outside', true);
    // `legacyId` of this one does not begin with the scope's prefix.
    await prisma.member.update({ where: { id: outside.id }, data: { legacyId: `other-${tag}Outside` } });

    const assessment = await assessRemoval(prisma, scope);

    expect(assessment.memberIds).not.toContain(outside.id);
    expect(assessment.keptMembers).toBeGreaterThanOrEqual(1);
  });
});
