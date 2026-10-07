# Session Handoff

**Last revised:** 7 October 2026

> Cold-start contract, overwritten every session.

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.13), `ARCHITECTURE.md` (1.10), `DESIGN.md` (1.2),
`ROADMAP.md` (1.17), and `QUESTIONS.md` (1.17).

Three rules outrank every default:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.
- The previous operator is never named (GOV-21). A test fails if it is.

## Status

- **Nothing is being built.** Items 37, 38, and 41 are pushed (`fcad368`).
- **Item 39 (the reference lists screen) is done and clicked through.** Its
  commit is local, and so is ORG-05's (`8115448`).
- **ORG-05 is answered**; its migration is applied to Neon (29, no drift).
- The feedback of 6 October is in `QUESTIONS.md`; the recordings are in
  `feedback/`, ignored by git.
- Planned, waiting for the owner: 40, 42, 43, and 15.

Tests: domain 518, contracts 138, api 195, web 75; e2e 498 of 499.

## Conflicts

- **Driver and Conductor are not yet first on Neon** (ORG-06): two moves
  on the Reference lists screen, once item 39 is deployed.
- **42 and 43 change the PRD and the schema.** Do not start either
  unapproved. 43's route half waits on VEH-35.
- Nothing amends a migrated member, moves an approved member to another
  unit, or adds a photograph after approval. No item covers these.
- **VEH-32 is open.** Do not build a second officer for stock.

## Known issues — don't re-attempt these fixes

- `master-data.e2e` "seeds no designations" fails (8 `DEMO_` designations).
- Under load, e2e and the PDF and password unit tests time out;
  `pay-links.e2e` can fail across an hour boundary: rerun.
- `GET /payments/banks` answers 500 when Paystack is unreachable (item 15).
- Never tried for real: a Paystack payment, a phone's camera, items 39
  and 41 deployed.

## Next steps

1. Ask the owner about pushing, and which item is next.
2. Owner: VEH-32; VEH-35's open points; the settlement account; GOV-08;
   EXT-05; the GOV-11 date; PAY-11; ORG-06, CARD-05, CARD-07.

## Do NOT

- Edit `apps/api/.env`, write Neon rows, or push without a go-ahead.
- Invent a designation or a signature (ORG-06, CARD-07).
- Put a sign-in button's reset back in a `finally`, or a photograph's
  link in a list.
- Widen a part of a member's record, or add contact data to the list.
