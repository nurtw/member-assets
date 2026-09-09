/**
 * Loads `.env` before any test constructs a Nest module.
 *
 * The end-to-end suite talks to a real database, so `DATABASE_URL` must be set
 * — and vitest, like `nest start`, does not read `.env` on its own. Without this
 * the suite passes only on a machine where the variable happens to be exported
 * in the shell, and fails on every other one with an error that reads like
 * missing configuration rather than a missing setup file.
 *
 * The same trap `main.ts` avoids by importing `dotenv/config` on its first line.
 * See CLAUDE.md → "The `.env` trap that cost real time".
 */
import 'dotenv/config';
