# Session Handoff

**Last revised:** 19 October 2026

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.18), `ARCHITECTURE.md` (1.12), `DESIGN.md` (1.3),
`ROADMAP.md` (1.21), and `QUESTIONS.md` (1.25).

Three rules outrank every default:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.
- The previous operator is never named (GOV-21). A test fails if it is.

## Status

- **Onboarding began 19 October 2026.** Items 44, 53, and 45 are live. SMS stays
  off until Termii is set up (`OPERATIONS.md`, "Text messages to members").
- **The Union's pattern and motion** (`DESIGN.md` §13) are pushed (`f82b053`);
  the contrast fixes (`603707c`) are committed, not pushed.
- **Item 54, the public docs page** (`plans/54-public-api-docs.md`), is
  committed, not pushed. `/docs` for anyone; the whole route map only for a
  holder of `docs.read_internal`. `db:seed` has run on Neon (19 October): the
  super administrator holds it, and no other role does.

Tests: domain 540, contracts 155, api 199, web 100; e2e 554 of 554.

## Conflicts

- **Go-live was set before its gates** (PRD §23.27): item 15, CARD-05, CARD-07,
  GOV-18, and GOV-08 are open. The owner's call, recorded.
- **The live API sleeps on Render** (GOV-02).
- Items 46 to 52 change the PRD; MEM-19, CARD-09, and CARD-10 block some.

## Known issues — don't re-attempt these fixes

- Under load, e2e and the PDF and password tests time out: rerun.
- Run e2e with the local `DATABASE_URL` exported: `.env` points at Neon.
- A click-through web build needs `NEXT_PUBLIC_API_BASE_URL` with `/api/v1`.
- Never tried: a payment through the live API, a phone's camera, real Termii.

## Next steps

1. Owner: push `603707c` and `e80eea1` (the session could not).
2. Owner: Termii's sender name and DND route, its keys on Render, then a test.
3. Item 46 needs the owner's go-ahead and a PRD revision. Items 50 and 51 wait
   on PAY-27's test, GOV-08, and CARD-09.

## Do NOT

- Edit `apps/api/.env`, write Neon rows, or push without a go-ahead.
- Write anything internal into the docs page's code (`CLAUDE.md`, item 54).
- Put pattern or motion behind a verdict, a list, or a form (`DESIGN.md` §13).
- Treat stickers as free in code: a ₦0 fee is the only switch (VEH-37).
- Return a NIN whole, or change `IDENTITY_ENCRYPTION_KEY` once NINs exist.
- Add an SMS placeholder for anything sensitive, or store a whole number.
