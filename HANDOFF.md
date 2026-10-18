# Session Handoff

**Last revised:** 18 October 2026

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.15), `ARCHITECTURE.md` (1.10), `DESIGN.md` (1.2),
`ROADMAP.md` (1.18), and `QUESTIONS.md` (1.21).

Three rules outrank every default:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.
- The previous operator is never named (GOV-21). A test fails if it is.

## Status

- **Nothing is being built.** Everything up to item 43 stage 1 is pushed
  (`ba6f73b`). Neon has all 30 migrations.
- **Collecting at the park is planned: items 44 to 52** (PAY-22, the
  owner's direction of 18 October). SMS first. Voice calls and the yearly
  sticker are set aside (GOV-23, VEH-36). Each needs the owner's approval.
- Item 43 stage 2 waits on VEH-35 (questions with the owner). Items 40 and
  15 wait too.

Tests: domain 518, contracts 144, api 195, web 79; e2e 508 of 509.

## Conflicts

- **Items 44 to 52 change the PRD.** They add to §2.1 (§2.3 needs an
  approved revision), revise Requirements 27.7, 27.8, and 27.14, and add
  the NIN to the sensitive data. Revise the PRD as each is built.
- **Open questions block them:** PAY-23 to PAY-27, MEM-19, ORG-08,
  CARD-09, CARD-10, GOV-22.
- **The live API sleeps on Render** (GOV-02): the owner's call.
- VEH-35 blocks item 43 stage 2. VEH-32: no second officer for stock.
- Driver and Conductor are not yet first on Neon (ORG-06).

## Known issues — don't re-attempt these fixes

- `master-data.e2e` "seeds no designations" fails (8 `DEMO_` designations).
- Under load, e2e and the PDF and password tests time out: rerun.
- `GET /payments/banks` answers 500 when Paystack is unreachable (item 15).
- Never tried for real: Paystack, a phone's camera, the site as deployed.

## Next steps

1. Ask the owner about pushing and the next item (44 recommended).
2. Owner: the questions above; the hosting; the settlement account; PAY-11;
   GOV-08; EXT-05; the GOV-11 date; ORG-06, CARD-05, CARD-07.

## Do NOT

- Edit `apps/api/.env`, write Neon rows, or push without a go-ahead.
- Return a NIN whole, or put a NIN or a photograph link in any list.
- Check a chassis number's format, or return one outside
  `vehicle.read_restricted`.
- Drop a column the form no longer asks for, or write one on an amendment.
- Put a sign-in button's reset back in a `finally`.
