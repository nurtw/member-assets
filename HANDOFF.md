# Session Handoff

**Last revised:** 19 October 2026

## Cold start

Read `CLAUDE.md`, `PRD.md` (1.18), `ARCHITECTURE.md` (1.12), `DESIGN.md` (1.3),
`ROADMAP.md` (1.22), and `QUESTIONS.md` (1.26).

Three rules outrank every default:

- No `Co-Authored-By` or "Generated with Claude Code" anywhere.
- `data/` stays out of version control, docs, plans, commits, and fixtures.
- The previous operator is never named (GOV-21). A test fails if it is.

## Status

- **Onboarding began 19 October 2026.** Items 44, 53, 45, and 54 are live. SMS
  is off until Termii is set up.
- **The API runs on DigitalOcean only** (GOV-02; `OPERATIONS.md` §2 and §7). The
  owner deleted Render on 19 October; the keep-warm job is gone.
- **Item 55, the caller's address** (`plans/55-caller-address.md`), is built and
  committed, not pushed. Until then, every caller is recorded at a Cloudflare
  address, so per-address limits are shared.
- The sticker key is `k2`. The 9 unattached signed stickers from September
  (`k1`) no longer verify.

Tests: domain 540, contracts 155, api 208, web 106; e2e 559 of 559.

## Conflicts

- **Go-live was set before its gates** (PRD §23.27): item 15, CARD-05, CARD-07,
  GOV-18, and GOV-08 are open. The owner's call.
- Items 46 to 52 change the PRD; MEM-19, CARD-09, and CARD-10 block some.

## Known issues — don't re-attempt these fixes

- Under load, e2e and the PDF and password tests time out: rerun.
- Run e2e with the local `DATABASE_URL` exported: `.env` points at Neon.
- A click-through web build needs `NEXT_PUBLIC_API_BASE_URL` with `/api/v1`.

## Next steps

1. Owner: approve the push. Then `EDGE_PROXY=cloudflare` and one
   `WEB_FORWARDING_SECRET` on DigitalOcean, the same secret on Vercel, and a web
   redeploy, then the live log.
2. Owner: encrypt DigitalOcean's variables. Termii: its keys there, then a test.
3. Item 46 needs a go-ahead and a PRD revision.

## Do NOT

- Edit `apps/api/.env`, write Neon rows, or push without a go-ahead.
- Write anything internal into the docs page's code (`CLAUDE.md`, item 54).
- Put pattern or motion behind a verdict, a list, or a form (`DESIGN.md` §13).
- Treat stickers as free in code: a ₦0 fee is the only switch (VEH-37).
- Return a NIN whole, or change `IDENTITY_ENCRYPTION_KEY` once NINs exist.
- Add an SMS placeholder for anything sensitive, or store a whole number.
- Set `NODE_ENV` at build time on DigitalOcean.
- Read a caller's address anywhere but `request.ip` (item 55).
