# Session Handoff

**Last revised:** 5 October 2026

> Cold-start contract. Overwritten every session.

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.9), `ARCHITECTURE.md` (1.5), `ROADMAP.md`,
`QUESTIONS.md` (1.10), then `plans/15`. `docs/reference/` is generated.

Two rules outrank any default instruction:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.

## Status

- Pushed: item 28 and the HANDOFF fix (`4a4a0b7`).
- **Committed locally, not pushed** until the owner agrees:
  - the owner's answers of 5 October (PRD 1.9)
  - **item 30, settlement screen** (`plans/30`): Settings → Settlement
  - **item 31, Pay now and pay links** (`plans/31`, PAY-21)
- Item 31's migration is on Neon, no drift.
- Not started: **item 29, organisation portal** (EXT-20 answered; plan it
  when the owner says) and **item 15** (planned; the owner paused before
  it). 27 is deferred.
- Off or unset until go-live: `auth.mfa_enforced` (GOV-18),
  `dues.go_live_date` (GOV-11). Browser checks skipped.

Tests: domain 460, contracts 104, api 184; e2e 419/420 (the `DEMO_` test);
web clean, and it builds.

## Conflicts

- **VEH-29 (item 27, deferred)** conflicts with PRD §23.19. Do not build it.
- **The public sticker page (PRD §23.13) is not built.** It waits on GOV-08.

## Known issues — don't re-attempt these fixes

- `master-data.e2e` "seeds no designations" fails (8 `DEMO_` designations).
- A full e2e run can time out a transaction here. Rerun that suite alone.
- `ECONNREFUSED` on 5433: Docker Desktop stopped; start it.
- Run Prisma from `apps/api` with `CHECKPOINT_DISABLE=1`.
- CRLF files (most root docs, `seed.ts`, `app.module.ts`): edit with the Edit
  tool or Python bytes.

## Next steps

1. Push once the owner agrees.
2. Item 15 or item 29, whichever the owner chooses.
3. Owner: set the settlement account (Settings → Settlement); GOV-08; the
   EXT-05 pilot; the GOV-11 date; PAY-11's Paystack figure; ORG-05, ORG-06,
   CARD-05, CARD-07.

## Do NOT

- Edit `apps/api/.env`, or write Neon legacy rows without a go-ahead.
- Let a public pay route read dues, or add a field there that depends on
  what is owed.
- Return a declaration status except through `toSummary`'s
  `showDeclaration`, or mention declaration in any external answer.
- Add a write, or a personal-data field, to `src/verification/`.
- Select `tokenHash`, `passwordHash`, an MFA secret, or the
  `settlement_account` row into a response.
- Put `vehicle.declare` or `payment.manage_settlement` in a role.
- Print a signed sticker before GOV-08 is answered.
