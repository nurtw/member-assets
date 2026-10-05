import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * The web application's unit tests (item 32): pure modules only — the
 * navigation table, the theme choice, and the check that every colour is a
 * token. Screens are checked by clicking through them (`CLAUDE.md`).
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
