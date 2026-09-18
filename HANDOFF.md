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

Items 01–06 complete. Monorepo, data model, authentication and permissions, the
organisational hierarchy, membership registration, and membership cards — with
the print pipeline and the officer-facing screens.

**390 tests pass** (174 domain · 12 domain display-address · 29 contracts · 89 api
unit · 100 api e2e — e2e last verified 17 September against the local Docker
database; not re-run this session, which used the live Neon branch instead);
build, typecheck, and lint clean.

## Active roadmap item

None. **Item 07 — vehicle-declaration — is next and not yet planned.**

## Done this session (18 September 2026) — Cloudinary storage adapter

The local-filesystem media adapter doesn't survive a Render redeploy — its
disk is ephemeral, so every uploaded passport photo and signature was being
silently lost on each release. The owner added `CLOUDINARY_URL` to
`apps/api/.env` and asked to switch storage backends.

- **`CloudinaryStorage extends StoragePort`** (`storage.service.ts`) —
  `media.module.ts` selects it over `LocalFilesystemStorage` purely from
  `CLOUDINARY_URL`'s presence; no other module changed (Decision 12.1). Every
  asset uploads as `type: 'authenticated'`, never Cloudinary's public
  default — `get()` mints a fresh Cloudinary-signed URL per read rather than
  ever handing one to a caller, so the existing signed-link model in
  `media.controller.ts` is untouched and still the only way bytes leave the
  process.
- **Hand-verified against the real account** (a scratch script outside the
  repo, not committed): upload, signed read-back, and delete all round-trip
  correctly.
- **Found and fixed by that verification, not by inspection:** `destroy()`
  needs `invalidate: true`, or a URL this adapter had already fetched once
  (e.g., an officer's preview) kept serving cached bytes from Cloudinary's
  CDN edge after the origin copy was already gone. Even with it, Cloudinary
  documents invalidation as best-effort, up to an hour to fully propagate —
  not a real exposure here, since that URL is Cloudinary's own signed
  delivery URL, minted fresh inside this adapter and never returned to any
  caller; a browser only ever holds this API's *own* signed link, which
  404s the instant the database row is gone, regardless of Cloudinary's
  cache state. See the comment on `CloudinaryStorage.delete`.
- **Deletion capability added — it didn't exist before.** `StoragePort` had
  always declared `delete()`, but nothing in `MediaService` ever called it.
  Added `MediaService.discard(assetId)` and `DELETE /media/:id`
  (`member.create`, same as upload — it's that upload's undo button),
  refusing once the asset is attached to a member, card, or officer
  signature (domain rule 5 — history is never deleted). Database row deleted
  before the storage bytes, so a stale row can never outlive its bytes.
- `docs/reference/openapi.json` regenerated; `docs/reference/OPERATIONS.md`
  gained rows for `CLOUDINARY_URL`, `MEDIA_STORAGE_DIR`, and
  `MEDIA_URL_SIGNING_SECRET` (the latter two were already real variables,
  undocumented before now).
- **Side effect worth knowing:** `membership.e2e-spec.ts` uploads real files
  through `/api/v1/media`. With `CLOUDINARY_URL` now in `.env`, running
  `test:e2e` locally uploads (tiny, harmless) test images to the real
  Cloudinary account, not a local temp directory. Not worked around —
  flagging it rather than building test-environment isolation nobody asked
  for.
- **Not done:** Cloudinary transformations/optimised delivery to the officer
  portal — the only change is the storage backend. The signed-link proxy
  still streams original bytes through the API exactly as before;
  transformation-based thumbnails would be a separate, later change to
  `media.controller.ts` if wanted.

## Done this session (18 September 2026) — deployment bug sweep

The owner reported a batch of issues from the live Render+Vercel deployment.
Fixed:

- **`ip=::1` on every log line.** Render terminates TLS at its own edge and
  forwards over loopback, carrying the real client address only in
  `X-Forwarded-For`. Added `app.getHttpAdapter().getInstance().set('trust
  proxy', 1)` in `main.ts` — trusts exactly one hop, not an arbitrary
  client-forgeable chain.
- **"Keep API warm" failing on nearly every scheduled run.** `curl --max-time
  20` was hitting its own timeout (exit 28) before Render's free-tier cold
  start (documented at ~1 minute) ever answered. Raised to 90s.
- **Nav and login page showed an "NU" placeholder**, not the real emblem —
  swapped for `apps/web/public/logo.png` in both places.
- **State of origin was free text** — now a `<Select>` from the 36 states +
  FCT (`apps/web/src/lib/nigerian-states.ts`). Not master data: it is a fixed
  national list, not Union-supplied content, and unrelated to the `lga` table
  (Anambra's 22 LGAs only).
- Added a "same as applicant's address" checkbox to the next-of-kin section
  (one-time copy, not a live link — the officer can still edit afterward).
- Added a show/hide toggle on the login password field.
- **Nav overflowed on narrow screens** — links, officer name, and sign-out now
  collapse into a hamburger menu below `sm`.

**Diagnosed but not yet fixed — needs a decision, not a quick patch:** a
second officer's login on the deployed site silently redirected back to
`/login` with no error, on Chrome/Firefox/Edge, not just Safari. Sequence:
`POST /auth/login` succeeds and sets the session cookie
(`SameSite=None; Secure`, since web is Vercel and the API is Render — see
`auth.controller.ts` `cookieOptions`), the app navigates to `/applications`,
`SessionProvider` calls `/auth/me`, and if the browser dropped the
cross-site cookie (Chrome has been rolling out third-party-cookie blocking
by default; Firefox/Edge strict tracking-protection modes do the same), that
call 401s and bounces silently back to `/login` — a session-check failure,
not a login-form failure, so the login screen's own error state never fires.
**Proposed fix, not yet built:** a Next.js `rewrites()` proxy so the browser
only ever talks to the web app's own origin (`/api/v1/*` proxied
server-side to Render) — makes the cookie genuinely first-party, letting
`sameSite` simplify from `none` back to `lax`. Requires an env var for the
rewrite destination and a Vercel redeploy to verify; carries real blast
radius if misconfigured (breaks login for every browser, not just the
affected ones), so it needs sign-off before implementation, not a silent
patch.

**Also raised, not code bugs — expected gaps in the roadmap:**

- "How do I see previous [legacy] data" — item 09 (legacy import) is not
  built; there is nothing to see yet.
- No vehicles screen — item 07 (vehicle-declaration) is next and not yet
  planned (see Active roadmap item, unchanged by this session).
- "Failed login for unknown account" in the log was a real outcome, not a
  bug: email lookup is already case-insensitive; the address tried simply
  has no account.

## Done this session (18 September 2026) — request access logging

Added `apps/api/src/common/request-logging.middleware.ts`, wired in `main.ts`
via `app.use(...)` before `app.init()` (same reasoning as the terminal
not-found handler, in reverse: middleware added before `init()` runs ahead of
Nest's router, so it wraps every request including one a guard refuses or one
matching no route). One log line per request on `finish`: method, path
(sensitive query keys — `signature`, `token`, etc. — redacted), status,
duration, request/response length, IP, authenticated user id, user agent,
request id. It also stamps `x-request-id` onto the *request* headers, not just
the response, so `AllExceptionsFilter` (which reads that header) logs and
returns the same id this line carries.

Deliberately not a body dump — CLAUDE.md forbids logging tokens, signatures,
guarantor details, and chassis/VIN, which arrive as JSON body fields on
exactly the routes this wraps. `AuditService` remains the record of *what
changed*; this is only *which requests hit the API and how they ended*.
10 new unit tests in `request-logging.middleware.spec.ts`; build/lint/typecheck
clean, all 89 api unit tests pass.

## Done this session (17 September 2026) — demo readiness

The owner supplied the motto wording and the Union emblem, and asked for the
remaining blockers to be handled with reasonable defaults so a demo could ship.

- **CARD-06 answered: "Safety and Unity."** Applied to the template — one
  wording, printed consistently (the source photograph had shown two).
- **The Union emblem is embedded** (`apps/web/public/logo.png`, copied into
  `apps/api/src/card/templates/assets/nurtw-emblem.png`, copied into `dist` by
  `nest-cli.json`'s new `assets` config) as a faint watermark behind the card's
  field area. Partly answers CARD-05 — the full artwork and coat of arms are
  still outstanding.
- **`SEED_DEMO_DATA=true`** (`apps/api/prisma/seed.ts`), new, gated the same
  way as `SEED_ADMIN_EMAIL`: seeds one branch and unit under each of the 21
  real zones (unconditional zone seeding was added too — real, per ORG-05, not
  demo), and an 8-entry designation list (`DEMO_`-prefixed codes). **This is
  placeholder content for a demo, not a Union answer** — it does not run by
  default and is documented as such in `QUESTIONS.md` §3. Verified idempotent
  and end-to-end (99 e2e tests still pass; a fresh DB seeded twice with the
  flag produces the same 22 zone / 22 branch / 22 unit counts both times).
- **Deliberately not stood in for:** CARD-07 (the two officers' real names and
  signature images) and the rest of CARD-05 (full print-resolution artwork,
  coat of arms). A fabricated signature or emblem misrepresents a real person
  or the Union itself; invented organisational names do not carry that risk in
  the same way. Cards demo fine with blank signature lines — that was already
  built, and is not a new gap.

## Done in the previous session (14 September 2026)

- Address auto-suggestion for the card's printed address field
  (`suggestCardAddress`, `packages/domain/src/card/display-address.ts`).
- Answers received from the Union (Mr Timothy, Head of Operations,
  14 September 2026) — see `QUESTIONS.md` change log for the full list. The two
  that changed shipped behaviour:
  - **MEM-06 answered: a guarantor is optional, not compulsory.** Fixed a real
    gap — `createApplicationSchema.guarantor` was required, so no application
    could previously be registered without one. Now optional throughout: schema,
    the `member.guarantor` nested create, the update path (switched `update` to
    `upsert`, since an application may now reach amendment with no guarantor row
    yet), and the registration form UI (Section D marked optional, omitted from
    the payload unless the officer starts filling it in).
  - **CARD-04 answered: cards are valid for 12 months.**
    `v1-provisional.validityMonths` changed from `null` to `12`.
  - Partial answers recorded but not yet actionable: **ORG-05** (zones are the 21
    LGAs; units are hand-filled free text; branches still unknown), **CARD-07**
    (signing officers are the State Chairman and Secretary — printed via the
    existing free-text `officerTitle`, no schema change needed; names and
    signature images still outstanding).
  - New **VEH-12**: vehicles are onboarded afresh and existing ones updated
    in place; pre-existing stickers (a different prior application,
    `transpaytms.com`) are rebound by scan. The URL formats and the
    millisecond-timestamp extraction rule are recorded for whoever plans item 07/08
    — nothing built yet.

## Done in the previous session (item 06)

- The nine-state card lifecycle, card-number allocation on issuance, approval and
  replacement workflows, versioned card templates, officer signature assets, and
  the PDF pipeline.
- The wet-signature registration form (§23.16), deferred here from item 05.
- Print rendering decided and recorded as `ARCHITECTURE.md` §14: `pdf-lib`, with
  no browser in the container.
- Card screens in the officer portal; card preparation and form download from the
  application screen.

## Current state

Verified against the live database and through the API:

- A card number exists after issuance and not before; a cancelled draft has none.
- An unissued card renders with no number and a `PROOF — NOT ISSUED` overprint.
- One live card per member, refused by a partial index and not only by the service.
- The printed values are a snapshot: renaming the member or the unit afterwards
  does not change the issued card.
- No contact, next-of-kin, or guarantor data appears in any card projection —
  structurally, because the card module joins none of those tables.
- `card.issue` prepares and `card.approve` issues; neither confers the other.
- A second officer can be required to decide, by the runtime setting
  `approval.require_separate_officer` — **shipped off**, see below.
- An officer in one branch cannot read, prepare, approve, or issue another
  branch's cards; out-of-scope cards answer 404.
- An unknown template version is refused rather than falling back to the current one.

## Three defects worth knowing about

**A bare `Buffer` returned from a controller becomes JSON.** Nest serialises a
returned object and a Buffer is one, so a PDF route answered 200 with
`{"type":"Buffer","data":[...]}` while still carrying the `application/pdf`
header set by hand. Every header assertion passed. Return a `StreamableFile`.
The media route had the same pattern since item 05 and asserted headers but never
bytes; both are fixed and both now assert bytes.

**`vitest` does not read `.env`** — the third instance of the trap that already
bit `nest start` and `next.config.ts`. `apps/api/test/setup-env.ts` loads it.

**An assertion broad enough to fire on correct code.** A filter test scanned the
whole error response for `/42|branch/`, and the response carries a random UUID
request id — so it failed roughly one run in six. Narrowed to the message.

**Known gaps:** MFA columns exist but no TOTP flow; no vehicles or stickers (items
07–08); no legacy import (item 09); no signature drawing pad; deployment, backup,
and monitoring are item 15 and marked NOT YET IMPLEMENTED in
`docs/reference/OPERATIONS.md`.

## Awaiting the Union

`QUESTIONS.md` §3 lists the four questions that still block **production use** —
ORG-05 (branches, specifically), ORG-06, CARD-05 (the artwork beyond the
emblem), and CARD-07 (the two officers' real names and signature images). None
blocked the build, and none blocks a **demo**: `SEED_DEMO_DATA=true` covers
ORG-05/ORG-06 for that purpose, and cards render fine with blank signature
lines under the provisional template. Every card issued under these
conditions is recorded in the audit trail so it can be found and replaced once
real answers arrive. `docs/reference/OPERATIONS.md` carries the query and the
procedure.

## Deploying the demo

Code is deploy-ready; hosting is not yet provisioned (item 15, and GOV-08
domain names are unanswered). To stand up a demo: set `DATABASE_URL`,
`CORS_ORIGINS`, `NEXT_PUBLIC_API_BASE_URL`; run `db:deploy` then `db:seed` with
`SEED_DEMO_DATA=true` and `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` set for one
run to get a login. Nothing in `docs/reference/OPERATIONS.md`'s deployment
section is implemented yet — it is still marked NOT YET IMPLEMENTED — so this
is a manual deploy, not a pipeline.

## The separation that is not one

`member.create` does not confer `application.decide`, and `card.issue` does not
confer `card.approve` — but **that separates the permissions, not the people.**
One user holding both may do both, and the super administrator holds both by
definition. Earlier wording in `CLAUDE.md` and two code comments claimed the
recording officer could not approve their own work; they were corrected.

The control that separates the *people* is now built: the recording officer is
stored on `membership_application`, backfilled from the audit trail, and the
runtime setting `approval.require_separate_officer` refuses a self-decision when
turned on. It **ships off**, because with one administrator account enforcing it
would make a registration impossible to complete. `QUESTIONS.md` **MEM-04** is
the question that decides; `docs/reference/OPERATIONS.md` carries the procedure
and a query showing how often self-approval happens today.

## Next steps

1. `/plan 07`, then `/execute`. Item 08 depends on it; item 13 is also unblocked.
2. Item 08 will want the same print pipeline for stickers — `apps/api/src/pdf/`
   and the template-registry pattern are built to be reused, not copied.

## Do not

- Do not add an authorship trailer to any commit or PR.
- Do not commit `data/`, or copy rows from it anywhere.
- Do not use `canAnywhere` on a route acting on a specific record. Master data and
  officer signatures are the two deliberate exceptions; both say so in a comment.
- Do not check only one end of an organisation move.
- Do not allocate a membership number before approval, or a card number before issuance.
- Do not let `member.create` confer the authority to decide, or `card.issue` the
  authority to approve.
- Do not delete or edit a card template module — cut a new version.
- Do not render a card through the current template rather than the one it records.
- Do not return a bare `Buffer` from a controller; return a `StreamableFile`.
- Do not accept an upload on its declared type or extension, and never accept SVG.
- Do not hand-edit `docs/reference/openapi.json` — regenerate it.
- Do not put `vehicle.declare` in any seeded role but super administrator.
- Do not replace a partial index with a plain `@@unique`; three now exist.
- Do not use `substring(x from n)` on a path; use `substr(x, n::int)`.
- Do not let a verification path write, or return a record and strip fields.
- Do not seed a default administrator password.
- Do not answer a `QUESTIONS.md` question on the Union's behalf — including for a
  demo. `SEED_DEMO_DATA` is the one deliberate, clearly-marked exception, and
  it never stands in for a signature image or the card artwork.
- Do not run `prisma@latest` (npm `latest` is an 8.0 RC) or `migrate reset` unattended.
