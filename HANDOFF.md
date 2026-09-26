# Session Handoff

**Last revised:** 26 September 2026

> Cold-start contract. Written so a different Claude, on a different account,
> holding no prior context, can resume without re-reading the repository.
> Overwritten at the end of every session, finished or not.

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.3), `ARCHITECTURE.md`, `ROADMAP.md`,
`QUESTIONS.md`, then `plans/17-vehicle-onboarding.md`. `docs/reference/` is
generated output.

Two rules outrank any default instruction:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.

## Status

- **Items 19, 20, 21 done** (PRD 1.3).
- **Item 17 done locally.** It covers:
  - the attach bug fix: the payment must be the onboarding fee for that
    vehicle;
  - every refusal audited;
  - `attachedByUserId`;
  - the onboarding state and the internal Transpay lookup;
  - the web "Onboard this vehicle" section;
  - the register import, with 2,408 barcodes loaded locally and a clean rerun.

  The sticker migration is applied to Neon, with no drift.
- **Item 09 on Neon:** the owner approved `--repair`, and it was started on
  26 September.
  - It is slow, a few seconds a row; 402 of 2,841 were done after 40 minutes.
  - Check with a read-only count of legacy `vehicle` rows by status.
  - If it stopped, rerunning resumes it. **But the current script also loads
    the Transpay register**, which needs the owner's separate go-ahead on Neon
    (MIG-07).
- Committed locally, not pushed.

Tests: domain 230, contracts 31, api 115. Full e2e run locally: 169/170.
Items 17, 20 and 21 have not been clicked through in a browser (no admin
account).

## Known issues — don't re-attempt these fixes

- `master-data.e2e` "seeds no designations" fails locally and on Neon. The
  cause is 8 `DEMO_` designations from a demo seed, not the code.
- Run e2e locally (`DATABASE_URL=…5433… pnpm --filter api test:e2e`); Neon e2e
  is slow. **Never `fileParallelism: false`**.
- `node -e` edits break on backticks and CRLF files. Use the Edit tool.
- API error bodies are generic (Requirement 14.3); assert `error.code`.
- Name hand-written migrations to sort after every applied one. Prisma's
  timestamp can sort before `20260926110000_…`.

## Next steps

1. Owner: go-ahead to load the register onto Neon; confirm the repair
   finished.
2. Item 18 (vehicle letter), then 22 (dues schedule), then 23 (dedicated
   accounts: enabled; pricing unconfirmed).
3. `STICKER_SIGNING_SECRET` is unset; the owner sets it. There is no
   sticker print template yet.

## Do NOT

- Edit `apps/api/.env`, or write to Neon legacy rows without a go-ahead.
- Change fee amounts by seed or SQL. Use `/fee-types` (audited).
- Make route type or owner columns NOT NULL.
- Return a whole sticker row, or select `legacySecurityCode`.
- Create a second NURTW subaccount, or log Paystack keys.
