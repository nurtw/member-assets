# Session Handoff

**Last revised:** 2 October 2026

> Cold-start contract. Written so a different Claude, on a different account,
> holding no prior context, can resume without re-reading the repository.
> Overwritten at the end of every session, finished or not.

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.3), `ARCHITECTURE.md`, `ROADMAP.md`,
`QUESTIONS.md`, then `plans/23-dedicated-accounts.md`. `docs/reference/` is
generated output.

Two rules outrank any default instruction:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.

## Status

- **Items 09 and 17–22 are done and pushed** (`037b1bd`). Neon holds the
  legacy repair and the Transpay register.
- **Item 23, dedicated accounts: done, committed locally, not pushed.** Its
  migration is on Neon (additive).
  - Officers assign accounts from the application page.
  - Transfers arrive by webhook, are re-verified, credited net, and allocated
    oldest first.
  - Held credit is swept hourly.
  - Decisions are in the plan.
- **Not switchable on yet:** the contractor percentage ships unset (PAY-11).
  The steps are in `OPERATIONS.md` under "Switching on dedicated accounts".
  Nothing has been tried in Paystack test mode.
- New open question PAY-20 (BVN if Paystack demands identification).
- `dues.go_live_date` is still unset (GOV-11).

Tests: domain 275, contracts 31, api 125; e2e 202/203 locally; web
typecheck and lint clean.

## Known issues — don't re-attempt these fixes

- `master-data.e2e` "seeds no designations" fails (8 `DEMO_` designations).
- Run e2e locally (`DATABASE_URL=…5433…`); never `fileParallelism: false`.
- Run Prisma as `node node_modules/prisma/build/index.js`, with
  `CHECKPOINT_DISABLE=1`; `migrate dev` stalled from Git Bash before.
- CRLF files (`QUESTIONS.md`, `OPERATIONS.md`, `ROADMAP.md`, `seed.ts`, a few
  web pages): use the Edit tool. **`sed -i` strips every CR.**
- Name hand-written migrations to sort after every applied one.

## Next steps

1. Push item 23 once the owner agrees.
2. The verification track, items 10–15. Item 10 shows dues beside a scan
   result through `DuesService`.
3. Owner actions: confirm dedicated-account pricing, then set the
   percentage; answer GOV-11, PAY-18–20, VEH-27; set `STICKER_SIGNING_SECRET`.

## Do NOT

- Edit `apps/api/.env`, or write Neon legacy rows without a go-ahead.
- Change a fee amount except through `FeeTypeService`, or the contractor
  percentage except through its route.
- Allocate dedicated-account money without the member lock.
- Default the go-live date, or let dues reach any external response.
- Return a whole sticker row, or select `legacySecurityCode`.
