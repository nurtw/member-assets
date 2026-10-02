# Session Handoff

**Last revised:** 2 October 2026

> Cold-start contract. Written so a different Claude, on a different account,
> holding no prior context, can resume without re-reading the repository.
> Overwritten at the end of every session, finished or not.

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.3), `ARCHITECTURE.md`, `ROADMAP.md`,
`QUESTIONS.md`, then `plans/22-dues-schedule.md`. `docs/reference/` is
generated output.

Two rules outrank any default instruction:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.

## Status

- **Items 09, 17–21 done and pushed** (`e687adf`). On Neon: the legacy
  repair (2,841 on record) and the Transpay register (2,408 unattached,
  loaded 27 Sep with the owner's go-ahead).
- **Item 22, the dues schedule: done.** e2e green locally (dues 14/14,
  payments, openapi); the migration is on Neon.
  - Money owed is computed from the ledger and never stored.
  - Amount changes append to `fee_amount_history`, so a past month keeps
    the price it had.
  - Months are Lagos months.
  - Routes: `GET /vehicles/:id/dues` and `GET /members/:id/dues`. A dues
    panel shows on the vehicle, application and card pages.
- New open questions: PAY-18 (membership paid early or after a gap) and
  PAY-19 (levy stop; route-type change). Both are built literally.
- `dues.go_live_date` is unset until GOV-11, so migrated members' fees have
  not started.
- Item 22 is committed locally, not pushed.

Tests: domain 255, contracts 31, api 125; web typecheck and lint clean.

## Known issues — don't re-attempt these fixes

- **This machine is CPU-saturated** by VS Code processes. Commands run many
  times slower. Prisma `migrate dev` from Git Bash stalled; PowerShell
  worked.
- `master-data.e2e` "seeds no designations" fails (8 `DEMO_` designations).
- Run e2e locally (`DATABASE_URL=…5433…`); never `fileParallelism: false`.
- CRLF files (`QUESTIONS.md`, `OPERATIONS.md`, `app.module.ts`, a few web
  pages): use the Edit tool. **`sed -i` strips every CR.**
- Name hand-written migrations to sort after every applied one.

## Next steps

1. Item 23, dedicated accounts (PAY-11 pricing unconfirmed). It allocates
   against `DuesService`'s schedule, oldest first.
2. The verification track, items 10–15. Item 10 shows dues beside a scan
   result through `DuesService`.

## Do NOT

- Edit `apps/api/.env`, or write Neon legacy rows without a go-ahead.
- Change a fee amount except through `FeeTypeService`; history depends on it.
- Default the go-live date, or let dues reach any external response.
- Return a whole sticker row, or select `legacySecurityCode`.
