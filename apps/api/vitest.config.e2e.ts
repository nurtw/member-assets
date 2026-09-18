import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Runs in every worker before any test file. See test/setup-env.ts.
    setupFiles: ['./test/setup-env.ts'],
    /**
     * Vitest's 10s/5s defaults assume a local database. Against the live
     * Neon branch (`DATABASE_URL` in `.env`, the documented dev setup
     * without the Docker container running) `beforeAll` — which opens the
     * full Nest app and connects — and individual multi-request tests were
     * both tripping their defaults on nothing more than round-trip latency,
     * failing suites that were otherwise passing.
     */
    hookTimeout: 60_000,
    testTimeout: 20_000,
  },
});
