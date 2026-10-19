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

- **Onboarding began 19 October 2026.** Items 44, 53, 45, and 54 are live. SMS
  stays off until Termii is set up (`OPERATIONS.md`, "Text messages to members").
- **The API also runs on DigitalOcean**: App Platform app `member-assets`
  (doctl context `nurtw`, region `fra`), healthy at
  `https://member-assets-aa8oq.ondigitalocean.app`. Render still serves the web.

Tests: domain 540, contracts 155, api 199, web 100; e2e 554 of 554.

## Conflicts

- **Go-live was set before its gates** (PRD §23.27): item 15, CARD-05, CARD-07,
  GOV-18, and GOV-08 are open. The owner's call, recorded.
- **Two APIs share Neon** until Render is suspended; both run the background jobs.
- Items 46 to 52 change the PRD; MEM-19, CARD-09, and CARD-10 block some.

## Known issues — don't re-attempt these fixes

- Under load, e2e and the PDF and password tests time out: rerun.
- Run e2e with the local `DATABASE_URL` exported: `.env` points at Neon.
- A click-through web build needs `NEXT_PUBLIC_API_BASE_URL` with `/api/v1`.

## Next steps

1. Owner: copy `MFA_ENCRYPTION_KEY`, `MEDIA_URL_SIGNING_SECRET`, and the sticker
   signing pair from Render; check `IDENTITY_ENCRYPTION_KEY` matches; encrypt
   the variables.
2. Owner, to cut over: Vercel's `NEXT_PUBLIC_API_BASE_URL` to the new address
   with `/api/v1`, then redeploy the web; Paystack's webhook to
   `/api/v1/payments/webhook`; suspend Render. Then update `OPERATIONS.md` §2 and
   `CLAUDE.md`'s stack table.
3. Owner: open `/docs` signed out, then as the super administrator.
4. Termii's keys go on DigitalOcean. Item 46 needs a go-ahead and a PRD revision.

## Do NOT

- Edit `apps/api/.env`, write Neon rows, or push without a go-ahead.
- Write anything internal into the docs page's code (`CLAUDE.md`, item 54).
- Put pattern or motion behind a verdict, a list, or a form (`DESIGN.md` §13).
- Treat stickers as free in code: a ₦0 fee is the only switch (VEH-37).
- Return a NIN whole, or change `IDENTITY_ENCRYPTION_KEY` once NINs exist.
- Add an SMS placeholder for anything sensitive, or store a whole number.
- Let App Platform add a Functions component for `packages/`, or set `NODE_ENV`
  at build time.
