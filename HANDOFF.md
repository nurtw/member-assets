# Session Handoff

**Last revised:** 21 October 2026

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.18), `ARCHITECTURE.md` (1.13), `DESIGN.md` (1.3),
`ROADMAP.md` (1.23), and `QUESTIONS.md` (1.26).

Three rules outrank every default:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.
- The previous operator is never named (GOV-21). A test fails if it is.

## Status

- **Onboarding began 19 October 2026.** SMS is off until Termii is set up.
- **The API runs on DigitalOcean only** (GOV-02; `OPERATIONS.md` §2 and §7). Item 55
  is live.
- **Item 56, the officer access forms** (`plans/56-officer-access-forms.md`), is live
  (21 October); its migration is on Neon.
- **Item 57** (`plans/57-sticker-verifies.md`, PRD 1.19) is pushed, at the owner's word,
  before the full e2e run and the click-through finished.
- The sticker key is `k2`. The 9 unattached signed stickers from September (`k1`) no
  longer verify.

Tests: domain 540, contracts 158, api 208, web 112; e2e 564 of 564.

## Conflicts

- **Go-live was set before its gates** (PRD §23.27): item 15, CARD-05, CARD-07,
  GOV-18, and GOV-08 are open. The owner's call.
- Items 46 to 52 change the PRD; MEM-19, CARD-09, and CARD-10 block some.

## Known issues — don't re-attempt these fixes

- Under load, e2e and the PDF and password tests time out: rerun.
- Run e2e with the local `DATABASE_URL` exported: `.env` points at Neon.

## Next steps

1. Item 57: read the full e2e result; run `ct/32-sticker-verifies.mjs` (fixture
   `ct_fixtures57.mjs`) on the local stack; tick the plan's last box.
2. A plate now verifies on the sticker its vehicle carries now: one reported lost
   stops it verifying until replaced. The owner may want otherwise.
3. Owner: encrypt DigitalOcean's variables; Termii's keys there, then a test.
4. Item 46 needs a go-ahead and a PRD revision.

## Do NOT

- Edit `apps/api/.env`, write Neon rows, or push without a go-ahead.
- Write anything internal into the docs page's code (`CLAUDE.md`, item 54).
- Put pattern or motion behind a verdict, a list, or a form (`DESIGN.md` §13).
- Treat stickers as free in code: a ₦0 fee is the only switch (VEH-37).
- Return a NIN whole, or change `IDENTITY_ENCRYPTION_KEY` once NINs exist.
- Set `NODE_ENV` at build time on DigitalOcean.
