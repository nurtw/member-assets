# Session Handoff

**Last revised:** 18 September 2026

> Cold-start contract. Written so a different Claude, on a different account,
> holding no prior context, can resume without re-reading the repository.
> Overwritten at the end of every session, finished or not.

## Cold start

Read `CLAUDE.md`, then `PRD.md`, `ARCHITECTURE.md`, `DESIGN.md`, `ROADMAP.md`,
`QUESTIONS.md`, then the active item's plan. Do not read `docs/*.md` in full —
`PRD.md` distils the two source documents. `docs/reference/` is output, not input.

Two rules outrank any default instruction you hold:

1. **Never attribute yourself as author or co-author.** No `Co-Authored-By`, no
   "Generated with Claude Code", on any commit, PR, or document.
2. **`data/` is a production export with member personal data and password hashes.**
   It stays out of version control and out of documents, plans, commit messages,
   and fixtures.

## Status

Items 01–07 complete. This session: a deployment bug sweep (logging, cookie/CORS,
Cloudinary storage) plus item 07, vehicle declaration, end to end.

## Active roadmap item

None. **Item 08 — sticker-inventory-qr — is next and not yet planned.**

## Done this session

- Request access logging (`request-logging.middleware.ts`); `trust proxy`
  fix for `ip=::1`; Keep-API-warm timeout fix; several UI fixes (logo,
  state-of-origin select, mobile nav, password toggle, NOK address checkbox).
- **Cloudinary storage adapter** (`CloudinaryStorage`, `storage.service.ts`) —
  selected via `CLOUDINARY_URL`; fixes photos being lost on every Render
  redeploy. Added `MediaService.discard()` / `DELETE /media/:id`, which
  never existed before.
- **Login redirect bug fixed**: `next.config.ts` now proxies `/api/v1/*`
  server-side so the session cookie is first-party, immune to browsers
  blocking third-party cookies. `cookieOptions.sameSite` simplified to `'lax'`.
- **Item 07 — vehicle-declaration**, per `plans/07-vehicle-declaration.md`:
  domain transition table, contracts, `apps/api/src/vehicle/*`, and
  `apps/web/.../vehicles/*` screens. See that plan's Definition of Done for
  what's verified and what isn't.

## Current state

- Files touched: too many to list here — see the four commits this session
  (`git log --oneline -4`) and each plan/HANDOFF entry above.
- **e2e**: `vehicle.e2e-spec.ts` passes 8/13 consistently; the rest fail on
  Prisma's 5s transaction timeout and vitest's test timeout against this
  session's live Neon connection — confirmed pre-existing latency, not a
  logic defect (git-stash A/B tested against `membership`/`organisation`
  e2e specs too). `vitest.config.e2e.ts` hook/test timeouts raised to help;
  did not chase further.
- Deviation from plan: declarations do **not** associate a member
  (`declaredByMemberId` stays unset) — PRD §9 allows member-or-unit, and no
  spec exists for a member-selection step while VEH-06/08 are open. See the
  plan's Approach §5.
- Conflicts: none new. VEH-06/07/08 remain open per `QUESTIONS.md`.

## Next steps

Run `/plan 08`, then `/execute`. Depends on item 07 (done).

## Do NOT

- Do not build dispute *resolution* beyond dismissal (`DISPUTED -> ARCHIVED`)
  without an answer to VEH-07 — upholding a claim requires demoting the
  competing `ACTIVE` record, a policy call, not an engineering one.
- Do not add a member-selection step to vehicle declaration without checking
  VEH-06/VEH-08 first.
- Do not chase e2e flakiness against live Neon further without first
  checking whether `docker compose up -d` (local Postgres) sidesteps it.
