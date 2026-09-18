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

Items 01–07 complete. This session: a deployment bug sweep, a login-cookie fix,
item 07 (vehicle declaration) end to end, then a correction to it — vehicle
owner (member) association, which the original delivery wrongly deferred.

## Active roadmap item

None. **Item 08 — sticker-inventory-qr — is next and not yet planned.**

## Done this session

- Request access logging, `trust proxy` fix, Keep-API-warm timeout fix,
  several UI fixes (logo, state-of-origin select, mobile nav, password
  toggle, NOK address checkbox).
- **Cloudinary storage adapter**, selected via `CLOUDINARY_URL`; added
  `MediaService.discard()` / `DELETE /media/:id`.
- **Login redirect bug fixed** (cross-site cookie): `next.config.ts` proxies
  `/api/v1/*` server-side; `cookieOptions.sameSite` simplified to `'lax'`.
- **Login-twice bug fixed**: `/auth/me` is a global SWR cache key untied to
  `SessionProvider`'s mount lifecycle — a stale cached 401 from the
  pre-login redirect was served instantly on the post-login remount, before
  revalidation landed. Fixed with `mutate("/auth/me")` around login and
  logout (`login/page.tsx`, `lib/session.tsx`).
- **Item 07 — vehicle-declaration** built, then corrected (see plan's
  Definition of Done): declare/list/detail/update/suspend/retire/
  dismiss-dispute, each record-scoped and audited.
- **Correction: vehicle owner association.** The original delivery deferred
  `declaredByMemberId` entirely, reasoning VEH-06/08 blocked it — wrong,
  those questions are about evidence and transfer process, not whether an
  officer may name the operator at declare time (PRD §23.8 assumes this is
  routine). Now: settable on declare and on update (attach/change/clear,
  404 if the member doesn't exist), a plate-number search on the vehicle
  list (`?q=`), an Owner column, and a new minimal `GET /members?q=`
  lookup (gated `member.read`, not `application.read`) backing both the
  declare-form and detail-page member pickers
  (`apps/web/src/components/member-picker.tsx`).
- Fixed a pre-existing e2e test bug found while re-running the suite:
  `dismiss-dispute` asserted `200`; Nest's undecorated `@Post` defaults to
  `201`, same as every other action-style POST route here. Previously
  masked by the flakiness below.

## Current state

- **e2e**: `vehicle.e2e-spec.ts` 15/16 on the run that added the new owner-
  association tests (was 8/13) — the improvement looks like this run simply
  avoided the network latency, not a fix; treat 8/13 as the floor, not the
  ceiling. Remaining failures are pre-existing Prisma/vitest timeouts against
  this session's live Neon connection (git-stash A/B tested against other
  e2e specs earlier this session — not this item's code).
  `membership.e2e-spec.ts` gained a `member search` block; not yet confirmed
  green — check `git log`/rerun before trusting it.
- Conflicts: none new. VEH-06/07/08 remain open per `QUESTIONS.md`.
- Still true from the original delivery: dispute resolution is dismissal
  only; vehicle transfer is retire-then-redeclare, no bespoke endpoint;
  chassis/VIN evidence fields remain unbuilt (VEH-06).

## Next steps

Run `/plan 08`, then `/execute`. Depends on item 07 (done).

## Do NOT

- Do not build dispute *resolution* beyond dismissal (`DISPUTED -> ARCHIVED`)
  without an answer to VEH-07 — upholding a claim requires demoting the
  competing `ACTIVE` record, a policy call, not an engineering one.
- Do not chase e2e flakiness against live Neon further without first
  checking whether `docker compose up -d` (local Postgres) sidesteps it.
- Do not assume `GET /members` is a general member directory — it is a
  minimal picker lookup (id, name, membership number, organisation only),
  scoped by `member.read`, with no next-of-kin/guarantor/contact data. Do
  not widen its projection without re-reading PRD Requirement 7.1's reasoning
  for why the equivalent application list stays this narrow.
