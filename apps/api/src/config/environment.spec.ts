import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadEnvironment } from './environment.js';

/**
 * Boot-time configuration validation. A service that starts with bad
 * configuration and only fails on the first real request is materially harder to
 * diagnose than one that refuses to start, so these failure paths are tested.
 */
describe('loadEnvironment', () => {
  const original = { ...process.env };
  const VALID_URL = 'postgresql://user:pass@localhost:5433/db';

  beforeEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.PORT;
    delete process.env.CORS_ORIGINS;
    delete process.env.EDGE_PROXY;
    delete process.env.WEB_FORWARDING_SECRET;
    process.env.DATABASE_URL = VALID_URL;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it('applies defaults when nothing is set', () => {
    const env = loadEnvironment();

    expect(env.nodeEnv).toBe('development');
    expect(env.port).toBe(3001);
    expect(env.corsOrigins).toEqual([]);
  });

  it('parses a comma-separated origin list, trimming entries', () => {
    process.env.CORS_ORIGINS = 'http://localhost:3000, https://example.org ';

    expect(loadEnvironment().corsOrigins).toEqual([
      'http://localhost:3000',
      'https://example.org',
    ]);
  });

  it('ignores empty entries in the origin list', () => {
    process.env.CORS_ORIGINS = 'http://localhost:3000,,';

    expect(loadEnvironment().corsOrigins).toEqual(['http://localhost:3000']);
  });

  it.each(['0', '65536', 'abc', '3000.5', '-1'])(
    'rejects invalid port %s',
    (port) => {
      process.env.PORT = port;
      expect(() => loadEnvironment()).toThrow(/PORT must be an integer/);
    },
  );

  it('trusts no edge proxy and accepts no forwarded visitor by default', () => {
    const env = loadEnvironment();

    expect(env.edgeProxy).toBe('none');
    expect(env.webForwardingSecret).toBeUndefined();
  });

  it('reads the edge proxy, and refuses one it does not know', () => {
    process.env.EDGE_PROXY = 'cloudflare';
    expect(loadEnvironment().edgeProxy).toBe('cloudflare');

    process.env.EDGE_PROXY = 'fastly';
    expect(() => loadEnvironment()).toThrow(/EDGE_PROXY must be one of/);
  });

  it('refuses a forwarding secret short enough to guess', () => {
    process.env.WEB_FORWARDING_SECRET = 'too-short';
    expect(() => loadEnvironment()).toThrow(/at least 32 characters/);

    process.env.WEB_FORWARDING_SECRET = 'x'.repeat(32);
    expect(loadEnvironment().webForwardingSecret).toBe('x'.repeat(32));
  });

  it('rejects an unrecognised NODE_ENV', () => {
    process.env.NODE_ENV = 'staging';
    expect(() => loadEnvironment()).toThrow(/NODE_ENV must be one of/);
  });

  it('enforces a request body ceiling', () => {
    // PRD §14.3 requires a maximum request-body size. Asserted so the value
    // cannot quietly become undefined.
    expect(loadEnvironment().maxRequestBodyBytes).toBeGreaterThan(0);
  });

  it('reads the database connection string', () => {
    expect(loadEnvironment().databaseUrl).toBe(VALID_URL);
  });

  it.each([undefined, '', '   '])(
    'refuses to start without DATABASE_URL (%s)',
    (value) => {
      if (value === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = value;
      }

      // Failing at boot beats failing on the first query in production.
      expect(() => loadEnvironment()).toThrow(/DATABASE_URL is required/);
    },
  );
});
