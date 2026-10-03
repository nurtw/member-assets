# Session Handoff

**Last revised:** 3 October 2026

> Cold-start contract. Written so a different Claude, on a different account,
> holding no prior context, can resume without re-reading the repository.
> Overwritten at the end of every session, finished or not.

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.4), `ARCHITECTURE.md`, `ROADMAP.md`,
`QUESTIONS.md`, then `plans/24` to `plans/27`. `docs/reference/` is generated.

Two rules outrank any default instruction:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.

## Status

- **Nothing since `037b1bd` is pushed.** Three commits wait for the owner:
  the permission check blocks pushing.
- **The owner's decisions of 3 October are built** (PRD 1.4):
  - VEH-28: a declaration status reaches only holders of `vehicle.declare`.
  - Item 24: membership checks on the Verify screen.
  - Item 25: PAY-18 and PAY-19. Item 26: letter reissue (VEH-27).
  - New NURTW stickers are paused. PAY-20 is answered; nothing is built.
- Both migrations are on Neon: additive, no row changed.
- The owner said to skip the browser check and sticker printing.
- `dues.go_live_date` (GOV-11) is unset.

Tests: domain 329, contracts 38, api 130; local e2e 244/245; web clean.

## Conflicts

- **VEH-29 (item 27, deferred)** would add Transpay's unrecorded stickers by
  scanning. PRD §23.19 says the register is closed, and stands until revised.
  Do not build it.

## Known issues — don't re-attempt these fixes

- `master-data.e2e` "seeds no designations" fails (8 `DEMO_` designations).
- Run e2e locally (`DATABASE_URL=…5433…`, Docker started); never
  `fileParallelism: false`.
- Run Prisma from `apps/api`: `node node_modules/prisma/build/index.js`, with
  `CHECKPOINT_DISABLE=1`.
- CRLF files (`QUESTIONS.md`, `OPERATIONS.md`, `ROADMAP.md`, `CLAUDE.md`, some
  sources): use the Edit tool or Python `read_bytes`/`write_bytes`. `sed -i`
  and `write_text` corrupt line endings.
- Long inline heredocs fail in Git Bash; use a script file.

## Next steps

1. The owner pushes `main`.
2. Item 11, API clients and scopes. Seed the PRD §15 profiles under the
   projection's field names; update the `DisclosureField.fieldPath` comment.
3. Owner: confirm dedicated-account pricing and set the percentage; test a
   Paystack dedicated account (PAY-20); answer GOV-08 and GOV-11.

## Do NOT

- Edit `apps/api/.env`, or write Neon legacy rows without a go-ahead.
- Return a declaration status except through `toSummary`'s `showDeclaration`.
- Add a write, or a personal-data field, to `src/verification/`.
- Set a vehicle's route type without `recordRouteType`.
- Default the go-live date, or let dues reach any external response.
