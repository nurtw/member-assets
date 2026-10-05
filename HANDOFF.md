# Session Handoff

**Last revised:** 5 October 2026

> Cold-start contract, overwritten every session.

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.10), `ARCHITECTURE.md` (1.6), `DESIGN.md`, `ROADMAP.md`,
`QUESTIONS.md` (1.12), then `plans/32`. `docs/reference/` is generated.

Two rules outrank any default instruction:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.

## Status

- Items 29 to 31 and the click-through fixes are pushed (`688f62a`).
- **Planned on 5 October**, in this order: 32 (sidebar shell and themes),
  33 (Organisations and invite links, EXT-21), 34 (every screen restructured).
- **In progress: item 32** (approved). Nothing built yet.
- Item 15 waits; item 27 is deferred.
- Off until go-live: `auth.mfa_enforced` (GOV-18), `dues.go_live_date` (GOV-11).

Tests: domain 469, contracts 113, api 191; e2e 452/453 (the `DEMO_` test).

## Conflicts

- **VEH-29 (item 27, deferred)** conflicts with PRD §23.19. Do not build it.
- **The public sticker page (PRD §23.13) is not built.** It waits on GOV-08.
- `DESIGN.md` §6 defers dark mode until item 32 revises it.

## Known issues — don't re-attempt these fixes

- `master-data.e2e` "seeds no designations" fails (8 `DEMO_` designations).
- A full e2e run can time out a transaction. Rerun that suite alone.
- `ECONNREFUSED` on 5433: start Docker Desktop.
- Run Prisma from `apps/api` with `CHECKPOINT_DISABLE=1`.
- CRLF files (most root docs, `seed.ts`, `app.module.ts`): use the Edit
  tool or Python bytes.
- Long inline scripts fail in Git Bash: write a file, then run it.

## Next steps

1. Build item 32 (`plans/32-app-shell-and-themes.md`).
2. Items 33 and 34, each once the owner agrees.
3. Owner: set the settlement account (Settings → Settlement); GOV-08; the
   EXT-05 pilot; the GOV-11 date; PAY-11's Paystack figure; ORG-05, ORG-06,
   CARD-05, CARD-07.

## Do NOT

- Edit `apps/api/.env`, or write Neon legacy rows without a go-ahead.
- Push without the owner's agreement (their editor may push on its own).
- Give a portal account a permission, take an organisation's id from a
  portal request, or return a reason the API withheld from a portal route.
- Let a public pay route read dues, or leave a failed payment `PENDING`.
- Return a declaration status except through `toSummary`'s
  `showDeclaration`, or mention declaration in any external answer.
- Add a write, or a personal-data field, to `src/verification/`.
- Select `tokenHash`, `passwordHash`, an MFA secret, or the
  `settlement_account` row into a response.
