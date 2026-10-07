# Session Handoff

**Last revised:** 7 October 2026

> Cold-start contract, overwritten every session.

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.12), `ARCHITECTURE.md` (1.10), `DESIGN.md` (1.2),
`ROADMAP.md` (1.16), and `QUESTIONS.md` (1.16).

Three rules outrank every default:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.
- The previous operator is never named (GOV-21). A test fails if it is.

## Status

- **Nothing is being built.** Item 37 is pushed (`9492def`). Item 38 (the
  Union structure screen) is done and clicked through; its commit is local.
- Items 39, 40, and 15 are planned and wait for the owner.
- No migration is pending. Neon has all 28, and the seed.
- **Field feedback arrived on 7 October** in an untracked folder at the
  repository root (a brief, three transcripts, screenshots). It is read, not
  acted on, and not yet in `QUESTIONS.md`. The owner has been asked what to
  build.

Tests: domain 518, contracts 138, api 195, web 53; e2e 497 of 498.

## Conflicts

- **Do not commit the feedback folder.** Its name carries the previous
  operator's name. Stage files by path, never `git add -A`.
- **Nothing amends a migrated member's details, or moves an approved member
  to another unit.** No item covers either.
- **VEH-32 is open** (a second officer for stock). Do not build one.
- The public sticker page waits on GOV-08. Signed stickers stay paused.

## Known issues — don't re-attempt these fixes

- `master-data.e2e` "seeds no designations" fails (8 `DEMO_` designations).
- Under load, e2e and the PDF and password unit tests time out;
  `pay-links.e2e` can fail across an hour boundary: rerun.
- `GET /payments/banks` answers 500 when Paystack is unreachable (item 15).
- Never tried for real: a Paystack payment, a phone's camera.

## Next steps

1. Act on the owner's answers about the feedback, and about pushing item 38.
2. Owner: VEH-32; the settlement account; GOV-08; EXT-05; the GOV-11
   date; PAY-11; ORG-05, ORG-06, CARD-05, CARD-07.

## Do NOT

- Edit `apps/api/.env`, write Neon rows, or push without a go-ahead.
- Invent a branch, a designation, or a signature (ORG-05, ORG-06, CARD-07).
- Widen a part of a member's record, or add contact data to the list.
- Put `sticker.stock_intake` in a role, or a barcode in a URL.
- Add a write, or a personal-data field, to `src/verification/`.
