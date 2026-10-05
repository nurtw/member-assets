import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { API_SCOPES } from '@nurtw/contracts';

import { AppModule } from './../src/app.module.js';
import { SIGNED_IN } from './../src/auth/require-permission.decorator.js';
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

  it('declares a permission, a scope, the portal, or public status for every route', () => {
    // The guard denies a route carrying none, so one of these must be present
    // or the route is unreachable. Catching it here names the handler; catching
    // it at runtime produces a 403 nobody can explain.
    const undeclared = openApi
      .getRoutes()
      .filter(
        (route) =>
          !route.isPublic &&
          route.permission === null &&
          route.scope === null &&
          route.portal === null,
      )
      .map((route) => `${route.controller}.${route.handler}`);

    expect(undeclared).toEqual([]);
  });

  it('declares exactly one of them on each route', () => {
    // Decisions 9.1 and 9.8 — a route is internal or external, never both. The
    // guard refuses one that declares a scope with anything else; this names
    // it before it is ever called.
    const misdeclared = openApi
      .getRoutes()
      .filter(
        (route) =>
          [
            route.isPublic,
            route.permission !== null,
            route.scope !== null,
            route.portal !== null,
          ].filter(Boolean).length !== 1,
      )
      .map((route) => `${route.controller}.${route.handler}`);

    expect(misdeclared).toEqual([]);
  });

  it('requires only scopes that exist', () => {
    // Requirement 12.4 — a broad scope cannot be required because it cannot
    // be named: every scope a route asks for is in the catalogue.
    const unknown = openApi
      .getRoutes()
      .filter(
        (route) =>
          route.scope !== null &&
          !(API_SCOPES as readonly string[]).includes(route.scope),
      )
      .map((route) => `${route.controller}.${route.handler}: ${route.scope}`);

    expect(unknown).toEqual([]);
  });

  it('puts no officer route within reach of an API token', () => {
    // Registering organisations and issuing tokens are acts of the Union. If
    // one of these ever named a scope, an outside organisation could approve
    // itself.
    const external = openApi
      .getRoutes()
      .filter(
        (route) =>
          route.scope !== null &&
          /\/(api-clients|disclosure-profiles|auth|fee-types|payments)(\/|$)/.test(
            route.path,
          ),
      )
      .map((route) => `${route.method.toUpperCase()} ${route.path}`);

    expect(external).toEqual([]);
  });

  it('keeps the public surface to the routes that must be unauthenticated', () => {
    const publicRoutes = openApi
      .getRoutes()
      .filter((route) => route.isPublic)
      .map((route) => `${route.method.toUpperCase()} ${route.path}`)
      .sort();

    // Guarding the exact set makes an accidental @Public() a failing test rather
    // than a code review someone might wave through. Adding a line here should
    // require an argument for why the route cannot carry a permission.
    //
    // Media content is public in the sense that it requires no session: a browser
    // rendering <img> sends no cookie to another origin. It is not unprotected —
    // it requires an HMAC this service minted over both the asset id and an
    // expiry, valid for five minutes, and every failure answers 404.
    //
    // The pay routes (item 31, PRD Requirement 27.8 revision 1.9) are public
    // because holding a pay link is what lets a payer pay. They read no dues,
    // reveal nothing beyond the published amounts, and are limited per address.
    //
    // An invitation's page (item 33, Requirement 12.11 revision 1.10) is public
    // because the organisation invited has no account yet. It says only whom
    // the form is addressed to and until when, answers every closed link
    // alike, and is limited per address. An invitation confirms nobody.
    expect(publicRoutes).toEqual([
      'GET /api/v1/health',
      'GET /api/v1/media/:id/content',
      'GET /api/v1/pay/:code',
      'GET /api/v1/portal/invitations/:code',
      'POST /api/v1/auth/login',
      'POST /api/v1/auth/logout',
      'POST /api/v1/pay/:code',
      'POST /api/v1/payments/webhook',
      'POST /api/v1/portal/applications',
      'POST /api/v1/portal/login',
      'POST /api/v1/portal/logout',
    ]);
  });

  it('keeps the portal surface to an organisation’s own affairs', () => {
    // `@PortalAccount()` (item 29) is an outside organisation's own session.
    // Every route here acts on the organisation the session belongs to and
    // takes no organisation's id from the caller. Adding a line should need
    // an argument for why an outside party may do it for itself.
    const portal = openApi
      .getRoutes()
      .filter((route) => route.portal !== null)
      .map((route) => `${route.method.toUpperCase()} ${route.path} ${route.portal}`)
      .sort();

    expect(portal).toEqual([
      'GET /api/v1/portal/me OWN',
      'GET /api/v1/portal/tokens READY',
      'GET /api/v1/portal/usage READY',
      'POST /api/v1/portal/password OWN',
      'POST /api/v1/portal/tokens READY',
      'POST /api/v1/portal/tokens/:tokenId/revoke READY',
      'POST /api/v1/portal/tokens/:tokenId/rotate READY',
    ]);
  });

  it('puts approval and access beyond the reach of a portal session', () => {
    // If a portal route ever sat under these paths, an organisation could
    // approve itself or choose its own scopes, profile, or limits.
    const reaching = openApi
      .getRoutes()
      .filter(
        (route) =>
          route.portal !== null &&
          !route.path.startsWith('/api/v1/portal/'),
      )
      .map((route) => `${route.method.toUpperCase()} ${route.path}`);

    expect(reaching).toEqual([]);
  });

  it('keeps the signed-in-only surface to the officer’s own account', () => {
    // `@SignedIn()` asks for a session and no permission (item 28). It exists
    // for who-am-I, one's own password, and one's own second factor. Adding a
    // line here should require an argument for why the route names no
    // permission.
    const own = openApi
      .getRoutes()
      .filter((route) => route.permission === SIGNED_IN)
      .map((route) => `${route.method.toUpperCase()} ${route.path}`)
      .sort();

    expect(own).toEqual([
      'GET /api/v1/auth/me',
      'POST /api/v1/auth/mfa/confirm',
      'POST /api/v1/auth/mfa/enrol',
      'POST /api/v1/auth/mfa/recovery-codes',
      'POST /api/v1/auth/mfa/verify',
      'POST /api/v1/auth/password',
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
        ).toMatch(
          /\*\*Permission required:\*\*|\*\*Scope required:\*\*|\*\*Portal account required\.\*\*|deliberately public/,
        );
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
    expect(serialised).not.toMatch(/tokenHash|token_hash/);
  });
});
