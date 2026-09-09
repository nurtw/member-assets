import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from './../src/app.module.js';
import { OpenApiService } from './../src/docs/openapi.service.js';

/**
 * The API reference cannot drift from the API.
 *
 * Documentation rots because nothing fails when it does. These assertions are
 * the thing that fails: the route list is read from the dependency-injection
 * container, so a route added without documentation breaks the build, and a
 * document describing a route that no longer exists cannot be produced at all.
 */
describe('API reference (e2e)', () => {
  let app: INestApplication;
  let openApi: OpenApiService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    openApi = app.get(OpenApiService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('documents every route the application exposes', () => {
    const undocumented = openApi
      .getRoutes()
      .filter((route) => route.documentation === null)
      .map((route) => `${route.method.toUpperCase()} ${route.path}`);

    // If this fails, add @Documented() to the handler named above. It is not a
    // formality: the entry records which permission the route requires, and that
    // is the only place a reviewer can see the API's authorisation surface whole.
    expect(undocumented).toEqual([]);
  });

  it('declares a permission or public status for every route', () => {
    // The guard denies a route carrying neither, so one of these must be present
    // or the route is unreachable. Catching it here names the handler; catching
    // it at runtime produces a 403 nobody can explain.
    const undeclared = openApi
      .getRoutes()
      .filter((route) => !route.isPublic && route.permission === null)
      .map((route) => `${route.controller}.${route.handler}`);

    expect(undeclared).toEqual([]);
  });

  it('keeps the public surface to the routes that must be unauthenticated', () => {
    const publicRoutes = openApi
      .getRoutes()
      .filter((route) => route.isPublic)
      .map((route) => `${route.method.toUpperCase()} ${route.path}`)
      .sort();

    // Guarding the exact set makes an accidental @Public() a failing test rather
    // than a code review someone might wave through.
    expect(publicRoutes).toEqual([
      'GET /api/v1/health',
      'POST /api/v1/auth/login',
      'POST /api/v1/auth/logout',
    ]);
  });

  it('states the required permission in every operation description', () => {
    const document = openApi.getDocument() as {
      paths: Record<string, Record<string, { description?: string }>>;
    };

    for (const [path, operations] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(operations)) {
        expect(
          operation.description,
          `${method.toUpperCase()} ${path} does not state its authentication requirement`,
        ).toMatch(/\*\*Permission required:\*\*|deliberately public/);
      }
    }
  });

  it('describes request bodies from the schemas the API validates against', () => {
    const document = openApi.getDocument() as {
      paths: Record<
        string,
        Record<
          string,
          {
            requestBody?: {
              content: { 'application/json': { schema: Record<string, unknown> } };
            };
          }
        >
      >;
    };

    const createOrganisation =
      document.paths['/api/v1/organisations']?.post?.requestBody?.content[
        'application/json'
      ].schema;

    expect(createOrganisation).toBeDefined();
    expect(createOrganisation).toMatchObject({
      type: 'object',
      required: expect.arrayContaining(['name', 'level', 'parentId']),
    });

    // The levels come from the domain package's own constant, so a level added
    // there appears here without anyone editing documentation.
    const properties = (createOrganisation as { properties: Record<string, unknown> })
      .properties;
    expect(properties.level).toMatchObject({
      enum: ['COUNCIL', 'ZONE', 'BRANCH', 'UNIT'],
    });
  });

  it('describes the shared error envelope, including validation detail', () => {
    const document = openApi.getDocument() as {
      components: { schemas: { Error: { properties: { error: { properties: Record<string, unknown> } } } } };
    };

    const errorProperties = document.components.schemas.Error.properties.error.properties;
    expect(Object.keys(errorProperties).sort()).toEqual([
      'code',
      'details',
      'message',
      'requestId',
    ]);
  });

  it('carries no server-side detail in the document itself', () => {
    const serialised = JSON.stringify(openApi.getDocument());

    // The specification is served to any authenticated officer and is committed
    // to the repository, so it must not carry connection strings or secrets.
    //
    // Note this looks for secret *values* and internal field names, not the word
    // "password" — the login schema legitimately has a `password` field, and an
    // assertion broad enough to catch that would have to be deleted the first
    // time it fired, which is how a guard like this stops guarding anything.
    expect(serialised).not.toMatch(/postgres(ql)?:\/\//i);
    expect(serialised).not.toMatch(/DATABASE_URL/);
    expect(serialised).not.toMatch(/passwordHash/);
    expect(serialised).not.toMatch(/scrypt\$/);
    expect(serialised).not.toMatch(/SEED_ADMIN/);
    expect(serialised).not.toMatch(/mfaSecret|mfa_secret/);
    expect(serialised).not.toMatch(/STICKER_SIGNING_SECRET/);
  });
});
