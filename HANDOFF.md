# Session Handoff

**Last revised:** 18 October 2026

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.16), `ARCHITECTURE.md` (1.11), `DESIGN.md` (1.2),
`ROADMAP.md` (1.19), and `QUESTIONS.md` (1.22).

Three rules outrank every default:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.
- The previous operator is never named (GOV-21). A test fails if it is.

## Status

- **Item 44 (a member's NIN and photograph, PRD 1.16) is done and clicked
  through.** Committed locally, not pushed. Its migration
  (`20261018090000_member_identity`) is applied locally only.
- **Release order matters.** The member and application pages read the new
  table, so the migration must reach Neon before the code is pushed. Then
  `IDENTITY_ENCRYPTION_KEY` goes on the live API; until then, recording a
  NIN answers 503.
- Items 45 to 52 (collecting at the park) are planned; 45 is next. Item 43
  stage 2 waits on VEH-35. Items 40 and 15 wait too.

Tests: domain 518, contracts 149, api 199, web 84; e2e 523 of 524.

## Conflicts

- **Items 45 to 52 change the PRD** (§2.1, Requirements 27.7, 27.8,
  27.14). Revise it as each is built.
- **Open questions block them:** MEM-19, ORG-08, CARD-09, CARD-10.
- **The live API sleeps on Render** (GOV-02): the owner's call.
- VEH-35 blocks item 43 stage 2. VEH-32: no second officer for stock.
- Driver and Conductor are not yet first on Neon (ORG-06).

## Known issues — don't re-attempt these fixes

- `master-data.e2e` "seeds no designations" fails (8 `DEMO_` designations).
- Under load, e2e and the PDF and password tests time out: rerun.
- `GET /payments/banks` answers 500 when Paystack is unreachable (item 15).
- Never tried for real: Paystack, a phone's camera, the site as deployed.

## Next steps

1. Ask the owner to apply item 44's migration to Neon, then push.
2. Owner: `IDENTITY_ENCRYPTION_KEY` on the live API; register "NURTW"
   with Termii; the hosting; the settlement account; PAY-11; GOV-08.

## Do NOT

- Edit `apps/api/.env`, write Neon rows, or push without a go-ahead.
- Return a NIN whole, put one or a photograph link in any list, or change
  `IDENTITY_ENCRYPTION_KEY` once NINs are recorded.
- Check a chassis number's format, or return one outside
  `vehicle.read_restricted`.
- Drop a column the form no longer asks for, or write one on an amendment.
- Put a sign-in button's reset back in a `finally`.
