# Session Handoff

**Last revised:** 7 October 2026

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.14), `ARCHITECTURE.md` (1.10), `DESIGN.md` (1.2),
`ROADMAP.md` (1.17), and `QUESTIONS.md` (1.18).

Three rules outrank every default:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.
- The previous operator is never named (GOV-21). A test fails if it is.

## Status

- **Nothing is being built.** Items 37 to 39 and 41 are pushed (`5a15956`).
- **Item 42 (the registration form reduced, PRD 1.14) is done and clicked
  through**; its commit is local.
- The sign-in pages wake a sleeping API (`fb95031`, local).
- Planned, waiting: 40, 43, and 15.

Tests: domain 518, contracts 144, api 195, web 79; e2e 501 of 502.

## Conflicts

- **Item 42's migration is not on Neon (29 of 30). Apply it and push
  together**: the new code fails without it, and the live code cannot save
  a registration with it.
- **The live API runs on Render and sleeps** (no answer in 90 seconds,
  7 October). The stack table and GOV-02 say DigitalOcean; the hosting is
  the owner's.
- Driver and Conductor are not yet first on Neon (ORG-06): the owner
  moves them on the Reference lists screen.
- 43 changes the PRD and the schema: do not start it unapproved. Its
  route half waits on VEH-35.
- No item covers amending a migrated member, moving an approved member,
  or a photograph after approval.
- **VEH-32 is open.** Do not build a second officer for stock.

## Known issues — don't re-attempt these fixes

- `master-data.e2e` "seeds no designations" fails (8 `DEMO_` designations).
- Under load, e2e and the PDF and password tests time out: rerun.
- `GET /payments/banks` answers 500 when Paystack is unreachable (item 15).
- Never tried for real: Paystack, a phone's camera, the site as deployed.

## Next steps

1. Ask the owner: apply item 42's migration to Neon and push, together.
2. Owner: the hosting; VEH-32; VEH-35's open points; the settlement
   account; GOV-08; EXT-05; the GOV-11 date; PAY-11; ORG-06, CARD-05,
   CARD-07.

## Do NOT

- Edit `apps/api/.env`, write Neon rows, or push without a go-ahead.
- Drop a column the form no longer asks for, or write one on an amendment.
- Put a sign-in button's reset back in a `finally`, or a photograph's
  link in a list.
