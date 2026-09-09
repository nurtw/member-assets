import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Runs in every worker before any test file. See test/setup-env.ts.
    setupFiles: ['./test/setup-env.ts'],
  },
});
