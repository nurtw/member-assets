# Session Handoff

**Last revised:** 7 October 2026

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.15), `ARCHITECTURE.md` (1.10), `DESIGN.md` (1.2),
`ROADMAP.md` (1.17), and `QUESTIONS.md` (1.20).

Three rules outrank every default:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.
- The previous operator is never named (GOV-21). A test fails if it is.

## Status

- **Nothing is being built.** Items 37 to 39, 41, and 42 are pushed
  (`ab2ba06`). Neon has all 30 migrations.
- **Item 43, stage 1 (the chassis number compulsory, PRD 1.15) is done and
  clicked through.** Its commit is local, with one before it that records
  where the API is hosted. No migration.
- **Item 43, stage 2 (routes) is not started.** It waits on VEH-35.
- Planned, waiting for the owner: 40 and 15.

Tests: domain 518, contracts 144, api 195, web 79; e2e 508 of 509.

## Conflicts

- **The live API runs on Render and sleeps** (no answer in 90 seconds,
  7 October). Recorded in GOV-02; DigitalOcean is still the stated target.
  The sign-in pages wake it and explain the wait. Ending the wait is a
  hosting decision, and the owner's.
- **VEH-35 has four open points.** Stage 2 of item 43 adds a table and
  must not start before they are answered.
- Driver and Conductor are not yet first on Neon (ORG-06): the owner
  moves them on the Reference lists screen.
- No item covers amending a migrated member, moving an approved member,
  or a photograph after approval.
- **VEH-32 is open.** Do not build a second officer for stock.

## Known issues — don't re-attempt these fixes

- `master-data.e2e` "seeds no designations" fails (8 `DEMO_` designations).
- Under load, e2e and the PDF and password tests time out: rerun.
- `GET /payments/banks` answers 500 when Paystack is unreachable (item 15).
- Never tried for real: Paystack, a phone's camera, the site as deployed.

## Next steps

1. Ask the owner about pushing, and which item is next.
2. Owner: the hosting; VEH-35's open points; VEH-32; the settlement
   account; GOV-08; EXT-05; the GOV-11 date; PAY-11; ORG-06, CARD-05,
   CARD-07.

## Do NOT

- Edit `apps/api/.env`, write Neon rows, or push without a go-ahead.
- Check a chassis number's format, or return one outside
  `vehicle.read_restricted`.
- Drop a column the form no longer asks for, or write one on an amendment.
- Put a sign-in button's reset back in a `finally`, or a photograph's
  link in a list.
