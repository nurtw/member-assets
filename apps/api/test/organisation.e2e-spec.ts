import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from './../src/app.module.js';
import { AllExceptionsFilter } from './../src/common/all-exceptions.filter.js';
import { hashPassword } from './../src/auth/password-hashing.js';

/**
 * Organisational hierarchy — the scope boundaries, end to end.
 *
 * These run against the live development database. The fixture builds a
 * self-contained council under a recognisable name and removes it afterwards, so
 * a failing run leaves nothing behind that a later run would trip over.
 *
 * The assertions that matter are the negative ones. Anyone can make a create
 * endpoint work; the question this item has to answer is whether an administrator
 * scoped to one branch can reach another branch's records, and the only way to
 * establish that is to try it as that administrator.
 */

const connectionString = process.env.DATABASE_URL;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: connectionString ?? '' }),
});

const FIXTURE_TAG = 'e2e-fixture-org';
const PASSWORD = 'e2e-fixture-password-1';

interface Fixture {
  councilId: string;
  zone1Id: string;
  zone2Id: string;
  branch1Id: string;
  branch2Id: string;
  unit1Id: string;
  councilPath: string;
  branch1Path: string;
  branch2Path: string;
}

describe('Organisation hierarchy (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let fixture: Fixture;

  /** Session cookies, keyed by the role each user plays in these tests. */
  const cookies: Record<string, string> = {};

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    // Mirrors main.ts — without it a ConflictException surfaces as Nest's own
    // body and the status-code assertions below would pass for the wrong reason.
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer();

    await cleanUp();
    fixture = await buildHierarchy();
    await buildUsers(fixture);

    for (const who of ['council', 'branch1', 'branch2', 'readAllManageB1']) {
      cookies[who] = await login(emailFor(who));
    }
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
    await prisma.$disconnect();
  });

  // --- Reading -------------------------------------------------------------

  describe('reading the hierarchy', () => {
    it('returns only the subtrees the caller may read', async () => {
      const response = await request(server)
        .get('/api/v1/organisations')
        .set('Cookie', cookies.branch1!)
        .expect(200);

      const names = flatten(response.body.organisations).map(
        (node) => node.name,
      );

      // The branch itself and its unit, and nothing above or beside it.
      expect(names).toContain(`Branch One ${FIXTURE_TAG}`);
      expect(names).toContain(`Unit One ${FIXTURE_TAG}`);
      expect(names).not.toContain(`Council ${FIXTURE_TAG}`);
      expect(names).not.toContain(`Zone One ${FIXTURE_TAG}`);
      expect(names).not.toContain(`Branch Two ${FIXTURE_TAG}`);
    });

    it('presents the visible subtree as its own root', async () => {
      const response = await request(server)
        .get('/api/v1/organisations')
        .set('Cookie', cookies.branch1!)
        .expect(200);

      // A branch administrator's view legitimately has no council at its head.
      expect(response.body.organisations).toHaveLength(1);
      expect(response.body.organisations[0].name).toBe(
        `Branch One ${FIXTURE_TAG}`,
      );
      expect(response.body.organisations[0].children).toHaveLength(1);
    });

    it('never returns the materialised path', async () => {
      const response = await request(server)
        .get('/api/v1/organisations')
        .set('Cookie', cookies.council!)
        .expect(200);

      // The path is an internal denormalisation carrying every ancestor id. It
      // is the input to every scope decision and has no business in a response.
      expect(JSON.stringify(response.body)).not.toContain('path');
    });

    it('answers 404, not 403, for a node outside the caller’s scope', async () => {
      // Identical to a node that does not exist. A unit administrator
      // enumerating identifiers must not learn which of them are real.
      await request(server)
        .get(`/api/v1/organisations/${fixture.branch2Id}`)
        .set('Cookie', cookies.branch1!)
        .expect(404);
    });
  });

  // --- Creating ------------------------------------------------------------

  describe('creating a node', () => {
    it('permits creation within the caller’s own branch', async () => {
      const response = await request(server)
        .post('/api/v1/organisations')
        .set('Cookie', cookies.branch1!)
        .send({
          name: `Unit Created ${FIXTURE_TAG}`,
          level: 'UNIT',
          parentId: fixture.branch1Id,
        })
        .expect(201);

      expect(response.body.organisation.parentId).toBe(fixture.branch1Id);
      expect(response.body.organisation.depth).toBe(3);
    });

    it('refuses creation under another branch', async () => {
      // The heart of the item. Holding organisation.manage in branch one must
      // not authorise adding a node to branch two.
      await request(server)
        .post('/api/v1/organisations')
        .set('Cookie', cookies.branch1!)
        .send({
          name: `Smuggled ${FIXTURE_TAG}`,
          level: 'UNIT',
          parentId: fixture.branch2Id,
        })
        .expect(404);

      const smuggled = await prisma.organisation.findFirst({
        where: { name: `Smuggled ${FIXTURE_TAG}` },
      });
      expect(smuggled).toBeNull();
    });

    it('refuses a level that skips a level', async () => {
      await request(server)
        .post('/api/v1/organisations')
        .set('Cookie', cookies.council!)
        .send({
          name: `Wrong Level ${FIXTURE_TAG}`,
          level: 'UNIT',
          parentId: fixture.zone1Id,
        })
        .expect(409);
    });

    it('refuses a council at the root without root scope', async () => {
      // Creating a council is a Union-wide act, so it needs manage at "/".
      await request(server)
        .post('/api/v1/organisations')
        .set('Cookie', cookies.council!)
        .send({
          name: `Rogue Council ${FIXTURE_TAG}`,
          level: 'COUNCIL',
          parentId: null,
        })
        .expect(403);
    });

    it('rejects a malformed body with field-level detail and no record data', async () => {
      const response = await request(server)
        .post('/api/v1/organisations')
        .set('Cookie', cookies.council!)
        .send({ name: '   ', level: 'REGION', parentId: fixture.zone1Id })
        .expect(400);

      const fields = response.body.error.details.map(
        (detail: { field: string }) => detail.field,
      );
      expect(fields).toContain('name');
      expect(fields).toContain('level');
    });

    it('discards unknown fields rather than passing them to the write', async () => {
      const response = await request(server)
        .post('/api/v1/organisations')
        .set('Cookie', cookies.council!)
        .send({
          name: `Stripped ${FIXTURE_TAG}`,
          level: 'UNIT',
          parentId: fixture.branch1Id,
          isActive: false,
          path: '/forged/',
        })
        .expect(201);

      // A caller must not be able to set the path or the active flag by
      // including them in the body.
      const row = await prisma.organisation.findUniqueOrThrow({
        where: { id: response.body.organisation.id },
      });
      expect(row.isActive).toBe(true);
      expect(row.path).toBe(`${fixture.branch1Path}${row.id}/`);
    });
  });

  // --- Moving --------------------------------------------------------------

  describe('moving a node', () => {
    it('refuses when the caller lacks permission at the destination', async () => {
      // This user can READ the whole council, so both ends are visible, and can
      // MANAGE branch one only. The origin check passes; the destination check
      // is the one that must refuse.
      await request(server)
        .patch(`/api/v1/organisations/${fixture.unit1Id}/parent`)
        .set('Cookie', cookies.readAllManageB1!)
        .send({ parentId: fixture.branch2Id, reason: 'attempted removal' })
        .expect(403);

      const unchanged = await prisma.organisation.findUniqueOrThrow({
        where: { id: fixture.unit1Id },
      });
      expect(unchanged.parentId).toBe(fixture.branch1Id);
    });

    it('refuses when the caller lacks permission at the origin', async () => {
      const unitInBranchTwo = await prisma.organisation.create({
        data: {
          name: `Unit Two ${FIXTURE_TAG}`,
          level: 'UNIT',
          parentId: fixture.branch2Id,
          path: 'placeholder',
        },
      });
      await prisma.organisation.update({
        where: { id: unitInBranchTwo.id },
        data: { path: `${fixture.branch2Path}${unitInBranchTwo.id}/` },
      });

      // The mirror image: destination permitted, origin not.
      await request(server)
        .patch(`/api/v1/organisations/${unitInBranchTwo.id}/parent`)
        .set('Cookie', cookies.readAllManageB1!)
        .send({ parentId: fixture.branch1Id, reason: 'attempted acquisition' })
        .expect(403);

      const unchanged = await prisma.organisation.findUniqueOrThrow({
        where: { id: unitInBranchTwo.id },
      });
      expect(unchanged.parentId).toBe(fixture.branch2Id);
    });

    it('refuses a move into the node’s own subtree', async () => {
      await request(server)
        .patch(`/api/v1/organisations/${fixture.zone1Id}/parent`)
        .set('Cookie', cookies.council!)
        .send({ parentId: fixture.branch1Id, reason: 'cycle' })
        .expect(409);
    });

    it('refuses a move that would skip a level', async () => {
      await request(server)
        .patch(`/api/v1/organisations/${fixture.unit1Id}/parent`)
        .set('Cookie', cookies.council!)
        .send({ parentId: fixture.zone2Id, reason: 'wrong level' })
        .expect(409);
    });

    it('requires a reason', async () => {
      await request(server)
        .patch(`/api/v1/organisations/${fixture.unit1Id}/parent`)
        .set('Cookie', cookies.council!)
        .send({ parentId: fixture.branch2Id })
        .expect(400);
    });

    it('rewrites every descendant path in the same transaction', async () => {
      // Move branch one, which carries a unit, from zone one to zone two.
      const before = await prisma.organisation.findMany({
        where: { path: { startsWith: fixture.branch1Path } },
        select: { id: true },
      });
      expect(before.length).toBeGreaterThan(1);

      await request(server)
        .patch(`/api/v1/organisations/${fixture.branch1Id}/parent`)
        .set('Cookie', cookies.council!)
        .send({ parentId: fixture.zone2Id, reason: 'branch reassigned to zone two' })
        .expect(200);

      const moved = await prisma.organisation.findUniqueOrThrow({
        where: { id: fixture.branch1Id },
      });
      const zone2 = await prisma.organisation.findUniqueOrThrow({
        where: { id: fixture.zone2Id },
      });

      expect(moved.parentId).toBe(fixture.zone2Id);
      expect(moved.path).toBe(`${zone2.path}${fixture.branch1Id}/`);

      // Every descendant follows. A path left under the old prefix would answer
      // authorisation questions from ancestry the record no longer has.
      const descendants = await prisma.organisation.findMany({
        where: { id: { in: before.map((row) => row.id) } },
      });
      expect(descendants).toHaveLength(before.length);
      for (const descendant of descendants) {
        expect(descendant.path.startsWith(moved.path)).toBe(true);
        expect(descendant.path.startsWith(fixture.branch1Path)).toBe(false);
      }

      // And nothing outside the subtree was touched.
      const branch2 = await prisma.organisation.findUniqueOrThrow({
        where: { id: fixture.branch2Id },
      });
      expect(branch2.path).toBe(fixture.branch2Path);

      // Restore, so later assertions read the fixture as built.
      await request(server)
        .patch(`/api/v1/organisations/${fixture.branch1Id}/parent`)
        .set('Cookie', cookies.council!)
        .send({ parentId: fixture.zone1Id, reason: 'restore fixture' })
        .expect(200);
    });

    it('records the move in the audit trail with both paths', async () => {
      const event = await prisma.auditEvent.findFirst({
        where: { action: 'organisation.move', subjectId: fixture.branch1Id },
        orderBy: { createdAt: 'desc' },
      });

      expect(event).not.toBeNull();
      expect(event?.reason).toBeTruthy();
      expect(event?.actorUserId).toBeTruthy();
      expect(JSON.stringify(event?.beforeValue)).toContain('path');
      expect(JSON.stringify(event?.afterValue)).toContain('descendantsRewritten');
    });
  });

  // --- Deactivation --------------------------------------------------------

  describe('activation state', () => {
    it('refuses to deactivate a node with active children', async () => {
      const response = await request(server)
        .patch(`/api/v1/organisations/${fixture.branch1Id}/status`)
        .set('Cookie', cookies.council!)
        .send({ isActive: false, reason: 'attempted top-down deactivation' })
        .expect(409);

      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('deactivates a leaf, and then refuses to reactivate beneath an inactive parent', async () => {
      const leaf = await prisma.organisation.findFirstOrThrow({
        where: { name: `Unit Created ${FIXTURE_TAG}` },
      });

      await request(server)
        .patch(`/api/v1/organisations/${leaf.id}/status`)
        .set('Cookie', cookies.council!)
        .send({ isActive: false, reason: 'unit dissolved' })
        .expect(200);

      // Bottom-up now succeeds for the parent... after its other children go.
      const stillActive = await prisma.organisation.count({
        where: { parentId: fixture.branch1Id, isActive: true },
      });
      expect(stillActive).toBeGreaterThan(0);

      // Deactivate the branch's remaining children, then the branch itself.
      await prisma.organisation.updateMany({
        where: { parentId: fixture.branch1Id },
        data: { isActive: false },
      });

      await request(server)
        .patch(`/api/v1/organisations/${fixture.branch1Id}/status`)
        .set('Cookie', cookies.council!)
        .send({ isActive: false, reason: 'branch dissolved' })
        .expect(200);

      // The invariant: no node may be active beneath an inactive parent.
      await request(server)
        .patch(`/api/v1/organisations/${leaf.id}/status`)
        .set('Cookie', cookies.council!)
        .send({ isActive: true, reason: 'premature reactivation' })
        .expect(409);
    });

    it('never deletes a row', async () => {
      const branch = await prisma.organisation.findUnique({
        where: { id: fixture.branch1Id },
      });
      expect(branch).not.toBeNull();
      expect(branch?.isActive).toBe(false);
    });
  });

  // --- Fixture -------------------------------------------------------------

  async function buildHierarchy(): Promise<Fixture> {
    const make = async (
      name: string,
      level: 'COUNCIL' | 'ZONE' | 'BRANCH' | 'UNIT',
      parent: { id: string; path: string } | null,
    ) => {
      const row = await prisma.organisation.create({
        data: {
          name: `${name} ${FIXTURE_TAG}`,
          level,
          parentId: parent?.id ?? null,
          path: 'placeholder',
        },
      });
      return prisma.organisation.update({
        where: { id: row.id },
        data: { path: `${parent?.path ?? '/'}${row.id}/` },
      });
    };

    const council = await make('Council', 'COUNCIL', null);
    const zone1 = await make('Zone One', 'ZONE', council);
    const zone2 = await make('Zone Two', 'ZONE', council);
    const branch1 = await make('Branch One', 'BRANCH', zone1);
    const branch2 = await make('Branch Two', 'BRANCH', zone2);
    const unit1 = await make('Unit One', 'UNIT', branch1);

    return {
      councilId: council.id,
      zone1Id: zone1.id,
      zone2Id: zone2.id,
      branch1Id: branch1.id,
      branch2Id: branch2.id,
      unit1Id: unit1.id,
      councilPath: council.path,
      branch1Path: branch1.path,
      branch2Path: branch2.path,
    };
  }

  async function buildUsers(f: Fixture): Promise<void> {
    const passwordHash = await hashPassword(PASSWORD);
    const [read, manage] = await Promise.all([
      prisma.permission.findUniqueOrThrow({
        where: { code: 'organisation.read' },
      }),
      prisma.permission.findUniqueOrThrow({
        where: { code: 'organisation.manage' },
      }),
    ]);

    const create = async (
      who: string,
      grants: { permissionId: string; organisationId: string }[],
    ) => {
      const user = await prisma.user.create({
        data: {
          email: emailFor(who),
          fullName: `${who} fixture`,
          passwordHash,
        },
      });
      for (const grant of grants) {
        await prisma.userPermissionGrant.create({
          data: {
            userId: user.id,
            permissionId: grant.permissionId,
            organisationId: grant.organisationId,
            grantedByUserId: user.id,
            reason: 'e2e fixture',
          },
        });
      }
      return user;
    };

    await create('council', [
      { permissionId: read.id, organisationId: f.councilId },
      { permissionId: manage.id, organisationId: f.councilId },
    ]);
    await create('branch1', [
      { permissionId: read.id, organisationId: f.branch1Id },
      { permissionId: manage.id, organisationId: f.branch1Id },
    ]);
    await create('branch2', [
      { permissionId: read.id, organisationId: f.branch2Id },
      { permissionId: manage.id, organisationId: f.branch2Id },
    ]);
    // Reads the whole council; manages one branch. Isolates the two ends of a move.
    await create('readAllManageB1', [
      { permissionId: read.id, organisationId: f.councilId },
      { permissionId: manage.id, organisationId: f.branch1Id },
    ]);
  }

  async function login(email: string): Promise<string> {
    const response = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);

    const raw = response.headers['set-cookie'];
    const header = Array.isArray(raw) ? raw[0] : raw;
    if (!header) {
      throw new Error(`No session cookie issued for ${email}`);
    }
    return header.split(';')[0]!;
  }

  async function cleanUp(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: FIXTURE_TAG } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);

    const orgs = await prisma.organisation.findMany({
      where: { name: { contains: FIXTURE_TAG } },
      select: { id: true },
      orderBy: { path: 'desc' },
    });
    const orgIds = orgs.map((org) => org.id);

    // Audit events reference both, and organisations restrict on delete, so the
    // order here is not incidental.
    await prisma.auditEvent.deleteMany({
      where: {
        OR: [
          { actorUserId: { in: userIds } },
          { organisationId: { in: orgIds } },
        ],
      },
    });
    await prisma.userPermissionGrant.deleteMany({
      where: { organisationId: { in: orgIds } },
    });
    await prisma.userSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });

    // Deepest first: a parent cannot be removed while a child references it.
    for (const org of orgs) {
      await prisma.organisation.deleteMany({ where: { id: org.id } });
    }
  }
});

/**
 * Addresses are lower-cased here because `AuthService.login` lower-cases the
 * submitted address before looking it up. A fixture storing `readAllManageB1@…`
 * verbatim is simply unable to log in, and the failure reads as an authorisation
 * defect rather than a fixture typo.
 */
function emailFor(who: string): string {
  return `${who}.${FIXTURE_TAG}@nurtw.test`.toLowerCase();
}

interface FlatNode {
  name: string;
  children: FlatNode[];
}

function flatten(nodes: FlatNode[]): FlatNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}
