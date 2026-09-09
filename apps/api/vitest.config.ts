import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tsconfig path aliases are resolved natively by Vite. The former
  // vite-tsconfig-paths plugin is removed: it pinned a transitive dependency to
  // TypeScript 5 and produced an unmet peer warning against the workspace's
  // TypeScript 6.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
  },
});
