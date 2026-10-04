# Session Handoff

**Last revised:** 5 October 2026

> Cold-start contract. Overwritten every session.

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.9), `ARCHITECTURE.md`, `ROADMAP.md`,
`QUESTIONS.md` (1.10), then `plans/15`. `docs/reference/` is generated.

Two rules outrank any default instruction:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.

## Status

- Item 28 is done and pushed (`0e577f8`).
- **5 October 2026: the owner answered ten open questions** (QUESTIONS change
  log; PRD 1.9, §23.10, §23.22–§23.27). Docs only, committed locally, **not
  pushed** until the owner agrees.
- Two new roadmap items, both approved by the owner:
  - **30, settlement screen**: a Settings page over the two
    `/payments/settlement` routes. Build it **before item 15**, then update
    `OPERATIONS.md` "Switching on dedicated accounts".
  - **29, organisation portal** (EXT-20 answered): plan it when the owner
    says.
- Item 15 is planned; the owner paused before it. 27 is deferred.
- Off or unset until go-live: `auth.mfa_enforced` (GOV-18),
  `dues.go_live_date` (GOV-11). Browser checks skipped.

Tests: domain 453, contracts 94, api 183; e2e 393/394 (the `DEMO_` test);
web clean.

## Conflicts

- **VEH-29 (item 27, deferred)**, adding Transpay stickers by scanning,
  conflicts with PRD §23.19. Do not build it.

## Known issues — don't re-attempt these fixes

- `master-data.e2e` "seeds no designations" fails (8 `DEMO_` designations).
- The full e2e run can time out a transaction on this machine. Rerun the
  failing suite alone first.
- `ECONNREFUSED` on 5433: Docker Desktop stopped; start it.
- Run Prisma from `apps/api` with `CHECKPOINT_DISABLE=1`. Neon may need a
  retry while it wakes.
- CRLF files (most root docs, `seed.ts`, `app.module.ts`): edit with the Edit
  tool or Python bytes.

## Next steps

1. Push once the owner agrees.
2. Item 30, then item 15 (each with the owner's go-ahead).
3. Owner: GOV-08 (domains), the EXT-05 pilot, the GOV-11 date, PAY-11's
   Paystack figure, ORG-05, ORG-06, CARD-05, CARD-07.

## Do NOT

- Edit `apps/api/.env`, or write Neon legacy rows without a go-ahead.
- Return a declaration status except through `toSummary`'s `showDeclaration`,
  or mention declaration in any external answer.
- Add a write, or a personal-data field, to `src/verification/`; give an
  outside party a holder's name (EXT-13).
- Select `tokenHash`, `passwordHash`, or an MFA secret into a response, or
  log a token, password, or code.
- Put `vehicle.declare` or `payment.manage_settlement` in a role.
- Print a signed sticker before GOV-08 is answered.
