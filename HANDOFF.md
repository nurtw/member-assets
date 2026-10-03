# Session Handoff

**Last revised:** 3 October 2026

> Cold-start contract. Written so a different Claude, on a different account,
> holding no prior context, can resume without re-reading the repository.
> Overwritten at the end of every session, finished or not.

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.3), `ARCHITECTURE.md`, `ROADMAP.md`,
`QUESTIONS.md`, then `plans/10-internal-verification.md`. `docs/reference/` is
generated output.

Two rules outrank any default instruction:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.

## Status

- **Item 23 is committed as `43b9f55`, not pushed.** The push was blocked by
  the permission check, so it waits for the owner.
- **Item 10, internal verification: done, committed locally, not pushed.**
  - `POST /verifications` and a `/verify` page built for a phone.
  - `decideVerification` and `projectVerification`
    (`packages/domain/src/verification/`) are for item 12 to reuse.
- **Not yet opened in a browser.** Camera scanning waits on the QR's content.
- `STICKER_SIGNING_SECRET` is unset, so a signed code answers 503.
- `dues.go_live_date` is still unset (GOV-11).

Tests: domain 307, contracts 35, api 129; e2e 222/223 locally; web typecheck
and lint clean.

## Known issues — don't re-attempt these fixes

- `master-data.e2e` "seeds no designations" fails (8 `DEMO_` designations).
- Run e2e locally (`DATABASE_URL=…5433…`, after starting Docker Desktop);
  never `fileParallelism: false`.
- Run Prisma as `node node_modules/prisma/build/index.js`, with
  `CHECKPOINT_DISABLE=1`; `migrate dev` stalls from Git Bash.
- CRLF files (`QUESTIONS.md`, `OPERATIONS.md`, `ROADMAP.md`, `CLAUDE.md`,
  `seed.ts`, `app.module.ts`, the app layout): use the Edit tool. **`sed -i`
  strips every CR**, and Python's `write_text` turns LF files into CRLF; use
  `read_bytes`/`write_bytes`.
- Name hand-written migrations to sort after applied ones.

## Next steps

1. Push `43b9f55` and item 10's commit once the owner agrees.
2. Item 11, API clients and scopes. Seed the PRD §15 profiles under the
   projection's field names, and update the `DisclosureField.fieldPath`
   schema comment.
3. Owner actions: confirm dedicated-account pricing, then set the
   percentage; answer GOV-11, PAY-18–20, VEH-27; set
   `STICKER_SIGNING_SECRET`.

## Do NOT

- Edit `apps/api/.env`, or write Neon legacy rows without a go-ahead.
- Add a write call to `src/verification/`, or a verification field that
  carries personal data or dues.
- Change a fee amount except through `FeeTypeService`, or the contractor
  percentage except through its route.
- Allocate dedicated-account money without the member lock.
- Default the go-live date, or let dues reach any external response.
- Return a whole sticker row, or select `legacySecurityCode`.
