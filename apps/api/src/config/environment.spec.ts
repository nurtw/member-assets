import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadEnvironment } from './environment.js';

/**
 * Boot-time configuration validation. A service that starts with bad
 * configuration and only fails on the first real request is materially harder to
 * diagnose than one that refuses to start, so these failure paths are tested.
 */
describe('loadEnvironment', () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.PORT;
    delete process.env.CORS_ORIGINS;
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

  it('rejects an unrecognised NODE_ENV', () => {
    process.env.NODE_ENV = 'staging';
    expect(() => loadEnvironment()).toThrow(/NODE_ENV must be one of/);
  });

  it('enforces a request body ceiling', () => {
    // PRD §14.3 requires a maximum request-body size. Asserted so the value
    // cannot quietly become undefined.
    expect(loadEnvironment().maxRequestBodyBytes).toBeGreaterThan(0);
  });
});
