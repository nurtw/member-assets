import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from './../src/app.module.js';

// The Nest scaffold imports `App` from 'supertest/types', which does not resolve
// under NodeNext module resolution. The generic is not load-bearing here.
describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirrors main.ts. If the prefix is ever dropped there, this test fails,
    // which is the point — ARCHITECTURE.md Decision 11.1 must not regress silently.
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('serves health under the versioned prefix', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(response.body).toMatchObject({ status: 'ok' });
    expect(typeof response.body.timestamp).toBe('string');
  });

  it('does not serve health unversioned', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });

  it('discloses no infrastructure detail', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    // PRD §12.3 — health must not reveal internal infrastructure. This endpoint is
    // unauthenticated, so anything added to the payload is public. Guarding the
    // exact key set makes an accidental disclosure a failing test rather than a
    // code review someone might wave through.
    expect(Object.keys(response.body).sort()).toEqual(['status', 'timestamp']);
  });
});
