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
    /**
     * Raised from 20s: a test making several sequential requests (declare,
     * then transition, then verify — each its own round trip to Neon) was
     * tripping the old limit on latency alone, not a hung request. Still
     * bounded, so a genuinely stuck request fails loudly rather than
     * hanging the run.
     */
    testTimeout: 45_000,
    /**
     * Tried `fileParallelism: false` here to stop eight files' worth of
     * Postgres pools competing for Neon's connection limit — it turned an
     * intermittently-flaky ~15 minute suite into one that hung for over 12
     * hours before finishing, almost certainly a pool or mock-isolation
     * interaction between sequential files in the same worker, not a fix.
     * Reverted. The individual isolated-file failures under load are a real
     * Neon connection-limit issue (`test/openapi.e2e-spec.ts` and
     * `test/payments.e2e-spec.ts` are reliably green on their own; the
     * others are flaky only under full-suite concurrency) — worth revisiting
     * with a lower `poolOptions.threads.maxThreads` or a pooled
     * `DATABASE_URL`, not with sequential files.
     */
  },
});
