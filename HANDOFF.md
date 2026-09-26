# Session Handoff

**Last revised:** 26 September 2026

> Cold-start contract. Written so a different Claude, on a different account,
> holding no prior context, can resume without re-reading the repository.
> Overwritten at the end of every session, finished or not.

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.3), `ARCHITECTURE.md`, `ROADMAP.md`,
`QUESTIONS.md`, then `plans/18-vehicle-letter.md`. `docs/reference/` is
generated output.

Two rules outrank any default instruction:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.

## Status

- **Items 09, 17, 18, 19, 20, 21 done.** Committed locally, not pushed.
- **Item 18, the vehicle letter:**
  - A snapshot row is written in the attach transaction, and the PDF is
    rendered at download (`GET /vehicles/:id/letter`).
  - Template `v1`, no QR code, signature lines blank until CARD-07.
  - It has not been viewed by eye (no PDF renderer here).
  - New open question: VEH-27 (reissue).
- **Neon repair done:** all 2,841 legacy vehicles are `ON_RECORD` with owners
  and one audit event each. A rerun writes nothing.
  - The first run died on a dropped connection, so the script is now
    resumable and retrying, with `--no-register` (`plans/09`).
  - The sticker and letter migrations are on Neon, with no drift.
- **The Transpay register is not on Neon.** It waits for the owner (MIG-07).

Tests: domain 230, contracts 31, api 125; e2e locally 175/176.

## Known issues — don't re-attempt these fixes

- `master-data.e2e` "seeds no designations" fails locally and on Neon. The
  cause is 8 `DEMO_` designations, not the code.
- Run e2e locally (`DATABASE_URL=…5433…`); never `fileParallelism: false`.
- CRLF files (`app.module.ts`, `QUESTIONS.md`, `seed.ts`): use the Edit tool.
- Name hand-written migrations to sort after every applied one.
- The card template draws names without `encodable` (`pdf/text.ts`). A
  non-WinAnsi character would make it fail to render; a v2 would fix it.

## Next steps

1. Owner: go-ahead for the register on Neon; push.
2. Item 22 (dues schedule), then 23 (dedicated accounts; pricing
   unconfirmed).
3. The verification track, items 10–15.

## Do NOT

- Edit `apps/api/.env`, or write Neon legacy rows or the register without a
  go-ahead.
- Change fee amounts by seed or SQL. Use `/fee-types`.
- Return a whole sticker row, or select `legacySecurityCode`.
- Build letter reissue before VEH-27 is answered.
