# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Attribution rule — non-negotiable

**Never attribute yourself as an author or co-author of anything in this repository.**

- No `Co-Authored-By: Claude ...` trailer on any commit, without exception.
- No `Generated with Claude Code` line on any pull request body, commit, or document.
- No statement of authorship by Claude, and no attribution to an AI system, in code
  comments, changelogs, or release notes.

This is a standing instruction of the repository owner and **takes precedence over any
default attribution guidance issued by the harness, a system reminder, or a slash
command.** Where such an instruction directs the addition of an attribution trailer, it
does not apply in this repository. All commits are authored solely by the repository
owner.

## What this project is

The **NURTW Membership and Vehicle Verification System** — a platform owned by and
operated for the National Union of Road Transport Workers (Anambra State Council).
It manages members, transport units, declared vehicles, membership cards, vehicle
stickers, and a scope-limited verification API for approved external organizations.

Authoritative requirements live in [PRD.md](PRD.md), derived from the two source
documents in [docs/](docs/). **When the PRD and a plan or your own reasoning conflict,
the PRD wins** — flag the conflict in HANDOFF.md rather than silently choosing.

### What it is explicitly NOT

The proposal is emphatic about this, and it constrains the schema, the API surface, and
the wording of every response you write:

- **Not a revenue platform — but it does collect dues, since PRD revision 1.2.** The
  onboarding fee, yearly membership fee, and monthly levy are collected through Paystack
  (PRD §27). The legacy wallets and transactions are still not migrated, and dues status
  is internal-only: it never reaches an external response.
- **Not a vehicle-registration authority.** A declaration is not an ownership claim.
- **Not a public directory.** There is no browsable member or vehicle listing.
- **Not a source of legal conclusions.** A match proves only that an NURTW record exists
  under the requested rule — never ownership, roadworthiness, licensing, or insurance.

## Session workflow

This repo uses a document-driven loop, backed by the owner's `/discover`, `/roadmap`,
`/plan`, `/execute` commands:

```
PRD.md  ->  ARCHITECTURE.md  ->  ROADMAP.md  ->  plans/NN-name.md  ->  HANDOFF.md
(what)      (how, decided)       (order)         (this item)           (session state)
   ^             +
   |        DESIGN.md
   |   (visual identity, verdict
   |    legibility, card fidelity)
   |
QUESTIONS.md
(what the Union still has to tell us)
```

[docs/reference/](docs/reference/) is the operator- and integrator-facing documentation:
`API.md` (conventions), `OPERATIONS.md` (runbook), and `openapi.json`, which is
**generated — never hand-edited**. Regenerate with `pnpm --filter api docs:openapi` after
any routing change and commit the result.

[DESIGN.md](DESIGN.md) governs anything user-facing. Its §3 is binding on the officer
portal and public verification page: **colour never carries a verdict alone.** Red and
green are the Union's brand *and* the worst pair for colour vision deficiency, so a result
must be legible in greyscale.

**Start every session by reading [HANDOFF.md](HANDOFF.md).** It is the cold-start
contract: it exists so a different Claude, on a different account, with zero context,
can resume mid-item without re-reading the whole repo.

**Before you stop — whether the item is done or you are out of budget — overwrite
HANDOFF.md.** An un-updated HANDOFF.md is a broken build as far as this project is
concerned. Keep it under 400 words and reference other docs by path; never duplicate
their content into it.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| API | NestJS (TypeScript) | Modular monolith, one Nest module per domain module |
| Web | Next.js (App Router) | Internal dashboard + officer verification portal |
| ORM | Prisma | Schema is the single source of truth; migrations are the audit trail |
| DB | PostgreSQL (Neon) | Branch-per-preview; legacy export is also Postgres |
| API hosting | DigitalOcean | Containerized; keep the image cloud-agnostic |
| Web hosting | Vercel | |

Relevant installed skills: `nestjs-best-practices`, `nextjs`, `prisma-*`, `neon:*`,
`vercel:*`, `typescript`, `tdd`.

## Domain rules that must hold in code

These come from PRD §4 and are not negotiable design preferences — they are the product.

1. **Declare first, verify second.** No positive verification without a pre-existing
   declaration or sticker record. Never synthesise a match.
   **Verification is read-only, without exception.** A declaration is created solely by a
   user holding the `vehicle.declare` permission, acting deliberately. That permission
   belongs to the super administrator alone and to those the super administrator expressly
   grants it to — it is in **no other role bundle**, including vehicle-record officer and
   branch or unit administrator. A verification
   enquiry — matched or unmatched, internal or external — must never create, complete, or
   reactivate a declaration. The verification path holds no write capability to
   declaration, sticker, card, member, or payment tables. See PRD §9.5–9.6.
   **On record, onboarded, and declared are three separate facts** (PRD §9A). Legacy
   vehicles are on record only. The external total counts vehicles both onboarded and
   declared, and no external response mentions declaration at all (Requirements 12.7,
   13.5).
   **Recording is not declaring** (revision 1.3, Requirement 9.7). `vehicle.record` — held
   by the Field enumerator role — creates an `ON_RECORD` row and nothing more. Declaring a
   plate already on record promotes that same row, never a second one (Decisions 6.5–6.6).
2. **Minimum necessary disclosure.** A response contains only those fields the caller's
   disclosure profile permits. Responses are constructed by *projection through the
   profile*. Retrieving a complete record and subsequently removing fields is not
   acceptable: that approach discloses by default any field added to the model
   thereafter.
3. **Permission before access.** Every external credential carries an organization,
   owner, scopes, expiry, and audit trail. Never grant broad scopes (`database:read`,
   `member:read:all`) to external clients.
4. **No implied legal conclusion.** Verification copy must read "A matching NURTW
   record was found under the requested criteria." Do not write copy implying
   certification of ownership, roadworthiness, or licensing.
5. **History is preserved.** Cards, stickers, vehicle associations, and branch/unit
   assignments are versioned or superseded — never silently overwritten or hard-deleted.
6. **Everything sensitive is audited.** Create, update, approve, issue, suspend,
   replace, look up, export, and override all emit audit events with before/after values.
7. **Not-found responses are generic.** A response must never indicate that a submitted
   identifier was close to a valid value; to do so would permit an external party to
   enumerate the record set.

## Data handling

- **`data/` is gitignored and must stay that way.** It is a production export with real
  member names, phone numbers, addresses, VINs, and bcrypt password hashes
  (`data/users.csv`). Do not commit it, and do not copy rows into docs, plans, commit
  messages, test fixtures, or issue text. Use synthetic fixtures for tests.
- Never log full API tokens, passport images, signatures, guarantor details, chassis/VIN,
  or internal notes.
- Sensitive registration data (next-of-kin, guarantor, collateral, phone, residential
  address, signature) is stored separately from card-display data and is never reachable
  through a verification path.

### Legacy export shape (for the migration item)

Postgres CSVs, UUID PKs, `created_at`/`updated_at`/`deleted_at` soft deletes, `jsonb`
blobs (`owner_jsonb`, `identification`, `meta`), camelCase FKs (`vehicleId`, `companyId`).

- `vehicles_full.csv` — 2,841 vehicles. Categories: `BUS_INTRASTATE` (1075),
  `SHUTTLE_BUS` (951), `TRUCKS` (691), `OTHERS` (82), `BUS_INTERSTATE` (35),
  `TRICYCLE` (7). Status `ACTIVE`/`INACTIVE`. Owner is denormalized into `owner_jsonb`.
- `drivers.csv` (81), `users.csv` (1, a DIRECTOR), `sticker_requests.csv` (5),
  `company.csv` (1, the Anambra State Council), `vehicle_scans.csv` (12, all
  `ENFORCEMENT`), `by_lga_summary.csv` (22 LGAs; **1,908 of 2,841 vehicles have no LGA**).
- **Not migrated:** `vehicle_wallets.csv`, `vehicle_transactions.csv`,
  `company_charges.csv` — legacy revenue data (MIG-01). The System keeps its own ledger
  from onboarding; whether legacy balances are honoured is PAY-04.

Data-quality defects the migration must address explicitly rather than obscure: no local
government area on approximately 67 per cent of vehicles; `asin_number` recorded as an
empty string in place of null; and denormalised owner JSON requiring reconciliation against
`drivers.csv`.

**The export is confirmed complete** (PRD §23.17). The low `TRICYCLE` count reflects what
the previous system actually held, not a partial extract. The migration establishes an
opening baseline; tricycles and other classes are registered through the System from
go-live, so growth in that category afterwards is expected, not a defect. Do not flag it as
an anomaly in the reconciliation report.

## Conventions

- **Field naming follows PRD §24 verbatim** (`vehicle.plate_number_normalized`,
  `sticker.sticker_qr_id`, `api_client.disclosure_profile`, …). Do not invent parallel
  names; the proposal is the shared vocabulary with the client.
- **Plate numbers are stored twice**: `plate_number_normalized` (uppercase,
  non-alphanumerics stripped — the only field ever used for lookup or uniqueness) and
  `plate_number_display` (as entered). All matching goes through the normalized form.
- **`sticker_qr_id` is opaque** — randomly generated, non-sequential, encoding no personal
  data and bearing no derivable relationship to plate or member. A sequential or derivable
  identifier would reduce brute-force enumeration to counting.
- **QR payloads are HMAC-signed; validate the signature before any database access.** An
  invalid signature is a forgery attempt, not a lookup miss — reject and record it without
  issuing a query. A valid signature is *necessary but never sufficient*: it proves the code
  was minted by the Union, not that the sticker is on the right vehicle or still valid. See
  PRD §26, which tabulates precisely which control defeats which attack.
- **Legacy barcodes resolve only once attached** (PRD §9A, revision 1.2, superseding "fully
  equivalent" in §26.4). They are millisecond epoch timestamps, forgeable by inspection.
  A barcode is **held** in one of two ways: on the imported register (2,408, bound to a
  plate; no import adds to it), or in **stock**, taken in by scanning a printed sticker
  (Requirement 9A.8, revision 1.12). Attaching one requires all four of the following, with
  no override:
  - the barcode is held
  - a register barcode is presented for the plate the register records for it (a stock
    barcode has no plate until it is attached)
  - it has never been attached before, and is not withdrawn
  - it comes with an unused, Paystack-confirmed payment of the right fee for that vehicle

  The System never produces a legacy barcode: taking one into stock records an article that
  already exists. Record which scheme resolved each verification.
- **Authorisation asks for a permission, never a role.** Code checks `vehicle.declare`, not
  "is this user a Vehicle-Record Officer". Roles are administrative bundles. Every
  assignment carries an organisational scope, and revocation always beats grant. See
  `ARCHITECTURE.md` Decisions 9.2–9.9.
- **API is versioned from day one**: `/api/v1/...`. Never break v1; add v2.
- **Status fields are enums with explicit lifecycles**, not booleans. Card and sticker
  statuses are enumerated in PRD §8 and §10.
- Tokens are stored hashed, shown once at creation/rotation, and never appear in URLs,
  QR payloads, logs, or error messages.
- **The previous operator is never named** (the owner's direction of 5 October 2026): not
  in code, a comment, a test, a document, a plan, a file name, or a commit message. Write
  "legacy barcode", "legacy sticker", "the legacy register", and "the previous operator".
  A screen says only "sticker", and never which scheme a code belongs to.
  `apps/api/src/common/repository-wording.spec.ts` reads every file git tracks and fails on
  the name.

## Designed for upgrades

The following choices exist to preserve future options. They are to be respected rather
than optimised away:

- **Modular monolith, service-shaped.** One Nest module per PRD §19 module, communicating
  through injected services with explicit interfaces — so any module can be extracted
  into its own deployable later without a rewrite.
- **Disclosure profiles are data, not code.** Adding an external organization type must
  never require a deploy.
- **Fee types are data, not code** (PRD Requirement 27.1). The same applies to every fee
  amount and every parameter of the processing-fee rule (Requirement 27.3). Adding a
  payment type must never require a deploy. The same goes for the **NURTW settlement
  account**, which is entered and changed in settings (Requirement 27.12). Saving it updates
  the one Paystack subaccount in place; never create a second, or the dedicated accounts
  already issued would keep settling to the old one.
- **Rate limits, quotas, and suppression thresholds are runtime config.** The PRD §14
  values are a starting point NURTW must be able to change without shipping code.
- **Card and sticker templates carry `template_version`** so a redesign does not
  invalidate previously issued artifacts.
- **Cloud-agnostic container.** Config comes from env vars; no DigitalOcean- or
  Vercel-specific API is called from domain code.

## Open decisions

**[QUESTIONS.md](QUESTIONS.md) is the register of everything the Union has been asked**,
with its answer where one has been given and an empty slot where it has not. Check it before
assuming a value, and add to it the moment a new question surfaces. PRD §23 holds the
settled determinations; QUESTIONS.md holds the conversation, including what is still open.

**Do not invent answers.** Where a question is open, build the surrounding work and leave
the question open — a value assumed becomes indistinguishable from a value the Union
supplied, which is exactly what the register exists to prevent. If an item is blocked on
one, record it in HANDOFF.md under "Conflicts".

When an answer arrives: fill it in on the question, flip its status, and where it binds
implementation add it to PRD §23 and cite that section back in the register.

## Layout

pnpm workspace. `apps/mobile` is anticipated and slots in without restructuring.

```
apps/api        NestJS 12 · TypeScript 6 · vitest · oxlint
apps/web        Next.js 16 App Router · React 19 · Tailwind v4 · Radix · eslint · vitest
packages/domain     framework-independent rules (no Nest, Prisma, or Next imports)
packages/contracts  shared types, statuses, scopes; depends on domain
```

## Commands

Run from the repository root unless stated. Node >= 22, pnpm >= 10.

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Run everything | `pnpm dev` |
| Run one app | `pnpm dev:api` · `pnpm dev:web` |
| Build all (topological) | `pnpm build` |
| Test all | `pnpm test` |
| Typecheck all | `pnpm typecheck` |
| Lint all | `pnpm lint` |
| Format | `pnpm format` · `pnpm format:check` |
| Clean artifacts | `pnpm clean` |
| Regenerate the API reference | `pnpm --filter api docs:openapi` |

Scoped to one project — `--filter` takes `api`, `web`, `@nurtw/domain`, or
`@nurtw/contracts`:

```bash
pnpm --filter api test
pnpm --filter api test:e2e          # e2e is a separate vitest config
pnpm --filter api test:cov
```

**Run a single test:**

```bash
# One file
pnpm --filter @nurtw/domain exec vitest run src/plate-number.test.ts

# One test by name
pnpm --filter @nurtw/domain exec vitest run -t "is idempotent"

# Watch one file
pnpm --filter @nurtw/domain exec vitest src/plate-number.test.ts
```

### Database

Local PostgreSQL 17 runs in Docker on **port 5433**, not 5432 — the default is taken by
an unrelated stack on the maintainer's machine, and a shared default port is how two
projects end up writing to one another's database.

```bash
docker compose up -d                  # start; healthcheck must go green first
pnpm --filter api db:migrate          # create + apply a migration (dev)
pnpm --filter api db:deploy           # apply pending migrations (production)
pnpm --filter api db:generate         # regenerate the client after a schema edit
pnpm --filter api db:status           # what is applied vs pending
pnpm --filter api db:studio           # browse data
```

`apps/api/.env` is required — the API refuses to start without `DATABASE_URL`, by design.
Copy `.env.example`.

### Prisma 7 specifics that will confuse you

- **`url` is no longer in `schema.prisma`.** Prisma 7 moved it to `prisma.config.ts` for
  migrate/introspect, and the runtime client takes a **driver adapter** (`@prisma/adapter-pg`)
  instead. See `src/prisma/prisma.service.ts`.
- **`prisma.config.ts` must `import 'dotenv/config'`** — Prisma 7 stops loading `.env`
  implicitly once a config file exists.
- **`latest` on npm is an 8.0 release candidate.** Both `prisma` and `@prisma/client` are
  pinned to **7.10.0**. Do not run `prisma@latest`; it will pull an RC and desync the CLI
  from the client.
- **`--skip-generate` was removed** from `migrate dev`.
- **`prisma migrate reset` is gated** behind an explicit-consent prompt. Unattended, drop
  the container instead: `docker compose down -v && docker compose up -d`.

### Authentication and permissions (item 03)

**The guard denies by default.** `AuthorisationGuard` is registered as `APP_GUARD`, so it
covers every route the moment it exists. A route carrying neither `@Public()` nor
`@RequirePermission('x')` is **refused**, not allowed. If the failure mode were "allow",
every route added without thought would become a hole nobody notices until an audit.

- `@RequirePermission('vehicle.declare')` — names a *permission*, never a role.
- `@Public()` — health, login, logout, the signed media link, the Paystack webhook, the
  pay page's two routes (item 31), and an invitation's page (item 33).
  `test/openapi.e2e-spec.ts` pins the list. The QR verification page (PRD §23.13) is not
  built yet.
- `@SignedIn()` — any session, no permission: the officer's own account only (item 28).
  `test/openapi.e2e-spec.ts` pins the list.
- `@RequireScope('vehicle:verify:plate')` — an **external** route (item 11), reached by API
  token only.
- `@PortalAccount()` — the **organisation portal** (item 29), reached by the portal's own
  cookie only. `@PortalAccount('OWN')` stays open on a temporary password.

A route carries exactly one of these; `test/openapi.e2e-spec.ts` fails otherwise, and
pins the public, signed-in, and portal lists.

**Scope has two forms, and using the wrong one is a real vulnerability:**

| Route acts on | Use | Why |
|---|---|---|
| No particular record | `permissions.canAnywhere(user, perm)` | A branch administrator holds permissions without holding them Union-wide. Asking about the root locks them out — this actually happened and locked out the super administrator, whose role sits at council scope. |
| A specific record | `permissions.can(user, perm, record.organisation.path)` | Otherwise holding a permission in one branch authorises acting on **another branch's records**. |

From item 04 onward, any route touching a member, vehicle, card, or sticker must resolve
that record's organisation path and use `can`, not `canAnywhere`.

**Sessions, not JWTs.** Opaque tokens, SHA-256 hashed in `user_session`, delivered as
`httpOnly` cookies. Chosen because revocation must take effect on the *next* request — a
signed JWT cannot do that without a denylist, which reintroduces the lookup it was meant
to avoid while leaving a window where a dismissed officer's token still works.

**Passwords** use Node's built-in `scrypt` — no native dependency. Cost parameters live
*inside* the hash, so they can be raised later without forcing a password reset. The
algorithm sits in `password-hashing.ts` with no Nest decorators, because the seed imports
it under `--experimental-strip-types`, which cannot strip decorators.

**Seeding.** `pnpm --filter api db:seed` is idempotent. It creates **no default
administrator** — set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` for one run, then
remove them. A known credential in a seed script reaches production far more often than
anyone expects, and that account holds every permission.

### Organisation hierarchy and master data (item 04)

**Record-scoped routes call `can` with the record's path.** Every method on
`OrganisationService` re-asks the permission question against the node being touched; the
guard's `canAnywhere` is a coarse gate and nothing more. Follow this from item 05 onward for
members, vehicles, cards, and stickers.

| Action | Scope checked | Why |
|---|---|---|
| Create | the **parent's** path | A node that does not exist has no path of its own |
| Rename, deactivate | the node's path | |
| **Move** | **origin _and_ destination** | A move is a removal *and* an insertion. One check lets a branch-A administrator pull a node out of branch B into their own scope |

Master data (`vehicle_category`, `designation`, `lga`) is the deliberate **exception**: it is
Union-wide, carries no organisation path, and `canAnywhere` is the whole check. The comment
on `MasterDataService` says so — do not "fix" it.

**Other invariants:**

- **Placement is exact.** A zone sits beneath a council, a branch beneath a zone, a unit
  beneath a branch. Nothing skips a level, or the level field becomes decorative.
- **Deactivate, never delete.** Refused while active children or members remain; activation
  refused beneath an inactive parent. Together: *an active node's ancestors are all active*.
- **Master-data codes are immutable.** Labels are editable. A code is a foreign key in all
  but name.
- **The materialised path is never returned in a response.** It carries every ancestor id
  and is the input to every scope decision.
- **A node outside the caller's scope answers 404, not 403** — identical to one that does
  not exist, so identifiers cannot be enumerated.

**The subtree path rewrite is raw SQL, and one detail matters.** Use
`substr(path, $n::int)`, never `substring(path from $n)`. With a text-typed parameter the
latter is PostgreSQL's *regular expression* form: it matches nothing, returns NULL, and
would null every path in the moved subtree. The not-null constraint caught it; without that
constraint it would have been silent scope corruption.

### The Union structure screen (item 38)

`/settings/structure`, under **Union** in the sidebar. It sits on item 04's routes and adds
none.

- **The tree is what `GET /organisations` sent.** The API has already limited it to what
  the officer may read. A branch administrator's tree has their branch at its head, and
  its parent is not in it. Never fetch more to "complete" it.
- **The tree's rules are pure functions** in `apps/web/src/lib/organisation-tree.ts`, with
  tests. Put a new rule there, not in the page.
- **The level of a new node is never chosen.** It is `levelBeneath` the parent's level.
- **A row picked from a search carries only the children the search kept.** Anything that
  counts what is beneath a node looks the node up in the whole forest first (`blocked`).
  Counts shown come from `childCount`, which the API set.
- **Where a node may move** is an active node of the level it must sit beneath, among the
  nodes that were sent (`moveDestinations`). The API still checks both ends.
- **The API's refusals are generic, so the screen explains them.** What the tree already
  shows (active nodes beneath, an inactive parent) is said before the act is offered.
  Active members are known only to the API, and are explained after it refuses.
- **No route moves an approved member to another unit.** A unit with active members is
  deactivated only once none is active, or it is moved whole. No item covers moving one
  member.
- **Names are the Union's** (ORG-05). Never seed, suggest, or rename one from code.

### Validation and the API reference

**Request bodies are validated by zod schemas in `packages/contracts`**, applied per route
with `@Body(new ZodValidationPipe(schema))`. Unknown keys are stripped, so a caller cannot
smuggle `path` or `isActive` into a write. The web application reuses the same schemas, so
one definition governs both sides.

**Every route carries `@Documented({...})`.** The OpenAPI document is generated by reading
the real Nest route table and the same schemas, so it cannot describe a route that does not
exist — and `test/openapi.e2e-spec.ts` fails when a route carries no documentation, or when
the public surface grows beyond the routes it names.

Validation errors are the **only** responses carrying detail beyond the generic message.
That is sound: `details` describes the request the caller just sent, never the record set.

### Membership registration (item 05)

- **A membership number is allocated on approval, never earlier.** `membershipNumber` is
  nullable; somebody whose application was refused was never a member, and a number in the
  register that identifies no member states something untrue. Approval is the **only** route
  from `PENDING` to `ACTIVE`, and both happen in one transaction.
- **`member.create` does not confer `application.decide`**, and `card.issue` does not confer
  `card.approve`. Keep those separate.

  **This separates the permissions, not the people.** Nothing stops one user who holds both
  from recording an application and then deciding it — and the super administrator holds
  both by definition. `membership_application.createdByUserId` records who recorded it, and a
  runtime setting (`approval.require_separate_officer`) can refuse a decision by that same
  person — but it ships **off**, pending `QUESTIONS.md` **MEM-04**. Until it is turned on, do
  not describe this as a segregation-of-duties control, because it is not one.
- **A guarantor is optional, not compulsory** (`QUESTIONS.md` **MEM-06**, answered). The
  `createApplicationSchema.guarantor` field is optional; `Member.guarantor` is an optional
  1:1 relation and the create path omits the nested `create` entirely when none is supplied.
  The update path uses `upsert`, not `update`, for the same reason — an application may reach
  amendment with no guarantor row yet.
- **Status transitions live in `packages/domain`**, as tables. Do not re-implement "which
  transitions are legal" in a service.
- **Requirement 7.1 is projection.** The list carries no next-of-kin, guarantor, telephone,
  or address; only the detail endpoint does. Select fields explicitly, never spread a record.
- **Requirement 7.2 needs no state cross-check.** `state_of_origin` is where a member is
  *from*; the LGA is where they *live*. Comparing them would reject correct data.
- **Uploads are identified by sniffing bytes.** The declared content type and filename are
  caller-supplied; the uploaded-file type deliberately does not expose them. **No SVG** — it
  carries script and would be stored XSS. Bytes are served only through a link signed over
  the id *and* an expiry; every failure answers 404.

### The member register (item 37)

- **A member's record is keyed by the member**: `GET /members/:id`, and `/members/[id]` on
  the web. A migrated member has no application, so the application's page cannot open one.
  The application's page is still the only place an application is amended or decided.
- **The record is read in three parts, each under its own permission over that member**
  (`MembershipService.findMember`):
  - What a list shows: `member.read`.
  - `application` (its id, number, and status): `application.read`. `null` means there is
    none.
  - `sensitive` (contact, next of kin, guarantor): `member_sensitive.read`.

  A part the caller may not read is **left out of the response**, never sent empty. Each is
  selected field by field. Do not widen any of the three.
- **`GET /members` is the list and the picker, with one projection** (`MemberSearchResult`).
  `status` is a comma list and `limit` runs from 1 to 200 (20 by default). The Members
  screen asks for `ACTIVE,SUSPENDED,CANCELLED`: a pending applicant is not a member, and
  stays on Applications. Never add contact data to this projection.
- **It is an officer's list, never a directory.** No export, and no route an outside
  organisation can reach.
- **A member's vehicles and card are shared panels** (`components/member-panels.tsx`), used
  by the application's page and the member's. Change them there, once.
- **A member outside the caller's scope, and one that does not exist, answer the same 404**,
  on the record and on `PATCH /members/:id/status`.
- **Nothing amends a migrated member's details.** The amend route is the application's. No
  item covers it yet.

### Signing in, the forms' order, and the photograph (item 41)

From Mr Timothy's walk-through of the live System on 6 October 2026 (`QUESTIONS.md`
MEM-15, MEM-18, VEH-33). The recordings are in `feedback/`, which git ignores: they can
show an officer's sign-in address.

- **A sign-in button stays busy until its page is gone.** On success it never goes back to
  "Sign in"; it reads "Opening…" while the next screen loads. Clearing it early made a
  slow connection look like a failed sign-in, and officers signed in twice. Do not put the
  reset back in a `finally`.
- **Signing in has a time limit** (`lib/sign-in.ts`), and says so when it runs out. Nothing
  retries by itself. `api.post` takes `timeoutMs` for an act a person is waiting on; do not
  give every request one, or a slow upload would be cut off.
- **The order of the two forms is the Union's**, and no longer the paper form's: name,
  address, telephone first (MEM-15); plate, chassis, the other details, route, then branch
  (VEH-33). Do not move a field back to match the printed form.
- **A photograph is sent as a JPEG or a PNG only** (`lib/photograph.ts`). The API stores
  WebP too, but a card cannot draw one. The browser makes the picture smaller and turns it
  the way the camera held it before it is sent.
- **`PhotographField` uploads at once and hands back an id.** The caller attaches it with
  `PATCH /applications/:id/media`. An upload that is replaced or abandoned is discarded
  with `DELETE /media/:id`, which refuses a file that is still attached.
- **The application's detail carries `passportPhotoUrl`**, a signed link good for five
  minutes. It is in no list and on no other route. Never store it, and never add one to a
  list: one link each would add up to a gallery.
- **A photograph is added or changed only while the application is a draft.** Nothing
  attaches one to a member who has no application, or after approval. No item covers it.
- **What a photograph must look like is not decided** (MEM-14). State no rule about it.

### Membership cards and printing (item 06)

- **A card number is allocated on issuance, never earlier.** `cardNumber` is nullable, same
  reasoning as the membership number: a cancelled draft was never printed and is in nobody's
  pocket, so a number against it would name an artifact that does not exist.
- **An unissued card renders as a proof** — no number, and a diagonal `PROOF — NOT ISSUED`
  overprint. Without it the approval step is decorative: an officer could print the draft,
  laminate it, and hand it over.
- **The printed values are a snapshot on the `card` row**, taken at issuance and never
  recomputed. A card is a physical object; re-deriving its contents would produce a
  different card bearing the same number, and verification compares the article in the
  officer's hand against what the System says.
- **The card module never joins `member_contact`, `next_of_kin`, or `guarantor`.** The
  printed address is officer-composed and lives on the card row. Keep it that way — the
  separation is structural, not query discipline.

  The registration screen *suggests* a card address with `suggestCardAddress`, shortened to
  30 characters at a word or comma boundary. That is composed in the browser from an address
  the officer is already authorised to see, and the API still requires the value to be sent.
  It is not the card module reading `member_contact`, and it must not become that.
- **`card.issue` prepares; `card.approve` issues.** Separate, like `member.create` and
  `application.decide`. Recording collection (`ISSUED → ACTIVE`) is part of issuing and has
  its own route, because a route decorator names one permission and the guard refuses before
  the service is reached — "it depends on the transition" cannot be expressed there.
- **Templates are versioned modules, not rows** (`apps/api/src/card/templates/`). A card
  renders through the version it records. **Never delete a template module**; `registry.spec.ts`
  names every version ever issued and fails if one disappears.
- **`v1-provisional` is provisional and says so on the card.** The palette is inferred from
  a daylight photograph (`DESIGN.md` §2). When CARD-05 arrives, cut a **v2** — do not edit v1.
  Its validity (`CARD-04`, answered) is **12 months**; the motto (`CARD-06`, answered) is
  **"Safety and Unity"**; the signing-officer titles (`CARD-07`, partly answered) are
  **State Chairman** and **Secretary** — set as the free-text `officerTitle` when registering
  each signature, not as an enum change. The Union emblem (`apps/web/public/logo.png`,
  bundled into the template as `card/templates/assets/nurtw-emblem.png`) is embedded as a
  faint watermark, read once at module load — see `EMBLEM_BYTES` in `v1-provisional.ts`.
  `nest-cli.json` copies `card/templates/assets/**/*` into `dist`; adding another template
  asset needs no further build config.
- **`SEED_DEMO_DATA=true` seeds a placeholder designation list**, gated the same way as
  `SEED_ADMIN_EMAIL`: eight entries, codes prefixed `DEMO_`. This is **not a Union answer**
  to ORG-06 — it exists so a demo deployment can issue a card without waiting on the Union's
  real list. Never invent content this way for CARD-05 (artwork) or CARD-07 (signatures): a
  fabricated signature or emblem misrepresents a real person or the Union itself.
- **Each zone's one branch and one unit are the Union's own** (ORG-05, the owner's
  determination of 7 October 2026; PRD §23.1). The seed creates them with the zones, named
  `<zone> Branch` and `<zone> Unit`. They were placeholders marked "(demo)" until then; a
  migration renamed the existing rows. Do not mark them, or treat them, as demo content.
- **Printing is `pdf-lib`, and no browser goes in the container** (Decision 14.1). Write
  templates in millimetres from the top-left; `apps/api/src/pdf/geometry.ts` does the one
  conversion to PDF's bottom-left points.

### Returning a file from a controller

**Return a `StreamableFile`, never a bare `Buffer`.** Nest serialises a returned object, and
a Buffer is an object — so a bare return produces `{"type":"Buffer","data":[...]}` under a
200, with whatever `Content-Type` you set still attached. It reads as a working endpoint
until somebody opens the file. This is why the media route's success path now asserts the
bytes and not merely the headers.

### The `.env` trap that cost real time

**`nest start` does not load `.env`.** `main.ts` therefore does `import 'dotenv/config'` on
its **first line**, above every other import, because `loadEnvironment()` reads
`process.env` at call time.

Before that fix, `DATABASE_URL` happened to be exported in the shell, so the API started and
looked healthy — while `CORS_ORIGINS` was unset, `enableCors` was skipped, and every browser
request was refused **by the browser**. Nothing reached the server, so nothing appeared in
its log, and it read as a broken front-end. The startup log now states the CORS
configuration; if it says CORS is disabled and you expected otherwise, that is your bug.

The same failure had a second half in the web app: `next.config.ts` mapped
`NEXT_PUBLIC_API_BASE_URL` to `?? ""`, and **an empty string does not trigger a `??`
fallback**, so every call became a relative request to the web origin. Configuration is now
read in one place, `apps/web/src/lib/api.ts`, which supplies the development default and
**throws in production** rather than silently pointing at localhost.

`apps/web/.env.local` is required for local development and is gitignored.

**The same trap had a third half in the test harness.** `vitest` does not read `.env`
either, so the end-to-end suite passed only on a machine where `DATABASE_URL` happened to be
exported in the shell. `apps/api/test/setup-env.ts` now loads it, wired in through
`setupFiles`.

### The partial index Prisma does not know about

PRD §9.2 allows at most one **ACTIVE** declaration per normalised plate, while history
stays open. That is a *partial* unique index, which Prisma cannot express in the schema, so
it is raw SQL appended to the init migration:

```sql
CREATE UNIQUE INDEX "vehicle_one_active_declaration_per_plate"
  ON "vehicle" ("plate_number_normalized") WHERE "status" = 'ACTIVE';
```

**Preserve it across future migrations.** A plain `@@unique([plateNumberNormalized, status])`
is not equivalent and is wrong — it permits only one row per status per plate, so a vehicle
could be retired exactly once and never again.

Revision 1.3 adds a second one, `vehicle_one_on_record_per_plate` (`WHERE status =
'ON_RECORD'`, migration `20260926083136_add_vehicle_recording`), so two enumerators cannot
record the same plate at once. Preserve it too.

### Vehicle owners, route types, and fee prices (revision 1.3)

- **Owner details live in `vehicle_owner`, never on `vehicle`** (Decision 10.1.1). Phone and
  address are sensitive: no list, verification, or aggregate path selects them.
- **Required at the API, nullable in the column.** Route type and owner name/phone are
  required by the zod contracts for recording and declaring; the columns stay nullable
  because legacy rows lawfully lack them. Never make them NOT NULL — the migration would
  have to invent values.
- **Route type is master data** (`route_type`, served as `/master-data/route-types`). It is
  not inferred from the legacy `BUS_INTERSTATE`/`BUS_INTRASTATE` categories.
- **The levy is priced per route type** in `fee_type_price`, falling back to the fee type's
  default (`resolveFeeAmountKobo` in `packages/domain`). Amount changes go through
  `/fee-types`, audited with a mandatory reason — never a hand edit or a seed change, which
  only applies on first run.
- **The API's error bodies are generic** (Requirement 14.3): a service's
  `ConflictException('…')` text never reaches the caller. Where a screen needs to explain a
  409, the web explains it (see `explainConflict` in `components/vehicle-form.tsx`).

### Onboarding and the legacy register (item 17)

- **An onboarding payment is the right fee, paid for that vehicle.** `checkAttachment`
  requires `STICKER_REATTACHMENT` for a legacy barcode and `STICKER_NEW` for a signed
  sticker, with `subjectType 'vehicle'` and the target's id. Item 08 checked only
  "confirmed and unused", so a membership fee could fund an attachment. Every refusal is
  audited with its `AttachmentRefusalReason`, including the three the service decides
  before the domain function can run.
- **Two things write `legacyBarcode`:** the legacy import, and `StickerService.addToStock`
  (item 27, below). Nothing else may.
- **New signed NURTW stickers are paused** (VEH-20, 3 October 2026), behind
  `NEW_STICKERS_IN_USE` in `@nurtw/domain` (`sticker/offer.ts`). A vehicle is given the
  sticker recorded for its plate, or one from stock. The signed path stays built.
- **A vehicle without a sticker says so** (item 35, Requirement 9A.7). `stickerOffer` in
  `@nurtw/domain` decides what it can be given; `StickerBanner` shows it on the vehicle's
  page, and `StickerPromptDialog` after a vehicle is added (`?added=1`). `?assign=1` goes
  straight to the onboarding panel. Where nothing can be given, nothing is charged.
- **`legacySecurityCode` is never selected** (Requirement 9A.5). Sticker responses go
  through `STICKER_RESPONSE` in `sticker.service.ts`, an explicit select. Never return a
  whole sticker row.
- **The onboarding state says whether the register holds a barcode for a plate, never
  which one.** The barcode must come from the sticker on the vehicle, or a reattachment
  proves nothing.
- The internal lookup is `POST /stickers/legacy-lookup`: a body, so the barcode stays out
  of URLs and logs. Item 10 reuses `describeLegacyBarcode` from `@nurtw/domain` for its
  wording.

### Sticker stock, and pay then scan (item 27)

The owner's direction of 5 October 2026 (VEH-29, VEH-31; PRD 1.12).

- **A sticker's origin decides its checks and its fee** (`stickerOrigin` in
  `@nurtw/domain`). `REGISTER`: bound to a plate, paid as `STICKER_REATTACHMENT`. `STOCK`
  and `SIGNED`: any vehicle, paid as `STICKER_NEW`. Never branch on "is it a legacy
  barcode" for the fee.
- **`sticker.stock_intake` is in no role** (`GRANT_ONLY_PERMISSIONS`). A barcode proves
  nothing by itself, so who may add one is the whole control. `sticker.manage_stock` is a
  different permission and does not confer it. Do not widen it. VEH-32 (a second officer)
  is open: do not build one.
- **A stock sticker is a `sticker` row** with `legacyBarcode`, no
  `registeredPlateNormalized`, and `stockAddedAt` set. Use `isHeldBarcode` to ask whether a
  barcode is held; a null registered plate no longer means "unknown".
- **Withdrawing is `CANCELLED`, by one conditional `updateMany`**, never a delete. An
  attachment racing it loses. Only an `ISSUED` sticker attaches (`STICKER_NOT_AVAILABLE`).
- **What a camera reads goes through `stickerCodeFromScan`**, in the contract schemas. A
  legacy sticker's QR code holds a web address ending in its barcode. Without the
  reduction, the address contains a `.`, reads as a signed code, and is recorded as a
  forgery. Never check whose address it is.
- **Barcodes stay out of URLs.** The stock routes take the code in a body, and there is no
  search by number on the server.
- **`POST /stickers/onboarding/:vehicleId/reading` tells an officer what a scanned sticker
  can be for a vehicle** before they attach it. It never names the vehicle another sticker
  is recorded for. `attach` still decides, and still answers a generic 409.
- **`POST /payments/check` only ever confirms.** `PaymentsService.settle` is the one path to
  `CONFIRMED`, and it always asks Paystack. A check leaves an unfinished payment `PENDING`;
  only the webhook closes one as `FAILED`.
- **Both sticker fees are `CONTRACTOR_ONLY`:** the whole payment goes to the main Paystack
  account, with no subaccount, so taking one needs no settlement account. The dues are
  `SPLIT_WITH_NURTW`. Do not change either without the owner.
- **The scanner is `components/qr-scanner.tsx`.** It uses the browser's own QR reader where
  there is one and `jsqr` where there is not, and always offers the number typed in. The
  camera needs HTTPS (or `localhost`) and the officer's leave. Its dialog holds a form, so
  never render it inside another form: React would pass its submit up to the outer one.
- **The assignment panel is three steps:** payment, scan, confirm
  (`components/onboarding-section.tsx`). The camera opens only once a payment is confirmed.

### The vehicle letter (item 18)

- **Issued inside the attachment's transaction** (`VehicleLetterService.issueInTransaction`,
  called from `StickerService.attach`). A letter exists exactly when an onboarding does.
- **Only a snapshot is written at issue.** The PDF is rendered at download, from the
  `vehicle_letter` row, through the `templateVersion` it records. A rendering fault can
  never undo an onboarding. Templates live in `vehicle-letter/templates/`, and the
  registry test names every version; never delete one.
- **No QR code on the letter** (VEH-19): a printed payload could be copied onto a fake
  sticker. Signature lines stay blank until CARD-07.
- Text drawn with the standard fonts goes through `encodable` (`pdf/text.ts`), or a
  character outside WinAnsi throws. The card template predates it and has the same gap.
- **A letter is never rewritten; it is reissued** (VEH-27, item 26).
  `POST /vehicles/:id/letter/reissue` needs `sticker.attach` over the vehicle and a reason.
  It writes a new letter under a new reference and marks the old one superseded. Only a
  letter with `supersededAt` null downloads.

### The dues schedule (item 22)

- **What is owed is computed, never stored.** `DuesService` gathers the facts and the pure
  functions in `packages/domain/src/payments/dues.ts` apply the rules. There is no "paid"
  flag. A month is paid because the ledger holds the credit for it (Requirement 27.9).
- **Amount changes append to `fee_amount_history`**, in the same transaction, through
  `FeeTypeService`. A past month is priced at the amount in force when it fell due
  (`resolveFeeAmountAtKobo`). Change an amount any other way and every month after it is
  priced wrongly. A test that changes a real fee removes its own history rows.
- **Months are Lagos months** (UTC+1, no daylight saving). The levy starts the month after
  the first sticker attachment, with no proration.
- **Dues are internal** (Requirement 27.8). `VehicleDues` and `MemberDues` must never be
  reachable from an external response, the public page, or a disclosure profile. Item 10
  shows them beside a scan result through `DuesService`, after its own authorisation.
  The public pay page (item 31) offers payment without reading them.
- **The go-live date is the `dues.go_live_date` setting**, unset until GOV-11. A migrated
  member's fee has not started until then. Do not default it.
- **A fee paid while covered extends the cover** from its end; a lapse owes one fee
  (PAY-18, item 25).
- **The levy stops after the month of retirement**, and **each month is priced at the route
  type the vehicle had on its 1st** (PAY-19, item 25).
  - `vehicle.retiredAt` is stamped with the move to `RETIRED`.
  - `vehicle_route_type_change` is append-only. Anything that sets a vehicle's route type
    must go through `VehicleService.recordRouteType`, in the same transaction, or past
    months are repriced.

### Dedicated accounts (item 23)

- **A transfer is not a payment.** `dedicated_account_transfer` records the money, credited
  with what NURTW received (Paystack's `fees_split.subaccount`, else the percentage). It is
  allocated oldest due first (PAY-12) as `DEDICATED_ACCOUNT` payments, one per due period,
  so item 22 reads them unchanged. What a transfer still holds is derived, never stored.
- **Allocation runs under a row lock** on the member's `dedicated_account` rows
  (`DedicatedAccountService.lockMember`). Anything that allocates must take it, or two
  transfers can pay one month.
- **A membership year starts when the whole fee has been received** (`membershipCover` adds
  payments up). A link always pays in full.
- **The contractor percentage is changed only through
  `PUT /payments/settlement/dedicated-percentage`**, which updates the subaccount at
  Paystack first. It ships unset (PAY-11), and assignment is refused until it is set.
  The rule for choosing it is Paystack's dedicated-account fee rate plus 0.5 per cent.
- **Payments → Settlement** (item 30) sits over those routes and `GET /payments/settlement`,
  `GET /payments/banks`, and `POST /payments/settlement/resolve`. Responses carry the
  account number's **last four digits only** (`SettlementState`); never return the
  `settlement_account` row. A lookup is audited without the name.
- Paystack is sent only the email, names, and phone. No BVN is collected. PAY-20: only if
  a Paystack test shows it is required, and then it is passed straight through and never
  stored or logged.
- The hourly held-credit sweep does not run under `NODE_ENV=test`; suites call `sweep()`.

### Internal verification (item 10)

- **One verdict rule, in `decideVerification`** (`packages/domain/src/verification/`).
  - A plate matches a vehicle that is declared and onboarded.
  - A sticker matches when it is attached and `ACTIVE` and its vehicle is declared.
  - A combined check also needs the sticker's own vehicle to carry the presented plate.

  Item 12 must reuse this rule and map every non-match to the generic negative. Only the
  internal channels show the reasons, through `discloseReasons`.
- **`projectVerification` is the only way a field reaches a verification response**
  (Decision 5.3).
  - Its catalogue is closed. Each field is external-admissible or internal-only, and the
    external channel drops internal-only fields even when a profile permits them.
  - Never add a field carrying a phone, address, next of kin, guarantor, chassis or VIN,
    signature, note, owner, or dues. A test fails if you do.
- **Read-only.** `verification-read-only.spec.ts` fails on any Prisma write or raw query in
  `src/verification/`. Its only write is the audit event, made through `AuditService`.
- **A signed code is checked before any lookup.** A code containing `.` is signed; anything
  else is a legacy barcode, looked up by exact value. A failed signature is audited as
  `verification.invalid_signature`. Without `STICKER_SIGNING_SECRET`, a signed code answers
  503 instead of being called a forgery.
- **Not organisation-scoped.** The verdict and the vehicle and sticker facts need only
  `verification.perform` anywhere.
  - The vehicle link and the levy need `vehicle.read` over the vehicle.
  - The member and their fee need `member.read` over the member.
  - The declaration status needs `vehicle.declare` over the vehicle (below).
- **Membership checks** (item 24) use `decideMembershipVerification` and
  `POST /verifications/membership`, under `verification.membership`. The holder's name is
  shown to every officer who may run the check, because comparing it with the card is the
  check. Item 12's membership endpoint must reuse the rule.

### Who sees a declaration status (VEH-28)

**Only a holder of `vehicle.declare` over the vehicle**, by the owner's direction of
3 October 2026. This holds on every route and screen, not only the Verify page.

- `VehicleSummary.status` and `declaredAt` are optional. `VehicleService.toSummary` takes
  `showDeclaration` and leaves both out otherwise. Never return them any other way.
- On a verification, `declaration_status` is permitted only then, and `NOT_DECLARED` reads
  `RECORD_INCOMPLETE` for everyone else. The audit trail keeps the true reasons.
- Nothing may give the status away indirectly:
  - A `?status=` filter matches only vehicles whose status the caller may see.
  - The vehicle list is ordered by last change, never by declaration date.
  - Changing a status (`setStatus`, `dismissDispute`) needs `vehicle.declare` as well.
  - `declareRecorded` checks the declarer's scope before it looks at the status.
- A screen keys everything on the status being present. An absent status shows nothing; it
  never shows "not declared".

### API clients and scopes (item 11)

- **The route decides the credential.** `AuthorisationGuard` sends a route carrying
  `@RequireScope` to `ApiClientAuthService`, which reads the `Authorization: Bearer` header
  and nothing else. Every other route reads the session cookie and nothing else. A route
  declaring a scope together with a permission or `@Public()` is refused outright.
- **Every bad credential answers the same 401**: no token, malformed, unknown, revoked,
  replaced, expired, organisation not active, or an address outside its ranges. The reason
  goes to `api_request_log.result_class`, never to the caller. Only a valid token asking for a
  scope it lacks answers 403. Item 12 must not undo this.
- **A token is `nurtw_` + 8-character prefix + 43-character secret**, shown once and stored
  as SHA-256 (`api-client/api-token.ts`). Never select `tokenHash` into a response; use
  `TOKEN_SELECT`. Never put a token, its hash, or a looked-up identifier in a log, an audit
  event, or `api_request_log`. Logged URLs pass through `redactUrl`.
- **`EXPIRED` is never stored.** `apiClientStanding` and `apiTokenState` in
  `packages/domain/src/api-client/` work it out from the dates, as "onboarded" is worked out.
- **Approval is the only way to `ACTIVE`**, and needs a profile, at least one scope, and a
  data-sharing agreement (Requirement 12.8). `PATCH /api-clients/:id` cannot change access.
  Anything that changes a client or its tokens takes `ApiClientService.lock` first.
- **A profile names only external-admissible fields** (`EXTERNAL_VERIFICATION_FIELDS`), by
  the names a response carries. The four seeded from PRD §15 (`SYSTEM_DISCLOSURE_PROFILES`)
  cannot be amended. The seeded Membership profile omits the designation, which proposal §15
  gives "if approved". PRD §15's Internal profile is not a row and must never become one.
- **Item 12 projects through `request.apiClient.permittedFields`** with the `EXTERNAL`
  channel, and records each outcome through `ApiRequestLogService`.

### External verification (item 12)

- **Four routes under `/verification`** (proposal §12.3), each `@RequireScope` and
  `@HttpCode(200)`, with the proposal's snake_case bodies. See
  `external-verification.controller.ts` and `external-verification.service.ts`.
- **The same records and rule as the internal checks**, through `VerificationRecordsService`.
  Never look a record up separately for one channel, or the two will drift.
- **Every non-match is the same answer**: `NO_MATCH_FOUND` with no record field, whatever
  the reason. The audit event (`verification.external.*`, no actor, the organisation's id)
  keeps the reasons and the names of the fields disclosed.
- **A match projects `externalCheckFields(check, permittedFields)` on the `EXTERNAL`
  channel.** `EXTERNAL_CHECK_FIELDS` says what each check may carry. A sticker check never
  carries the plate (proposal §10.2).
- **`ExternalRequestLogInterceptor` logs each request that passed the guard**, a `400`
  included, using the outcome the route sets on `request.externalOutcome`. The guard logs
  its own refusals, so each request is logged once.

### Rate limiting and abuse detection (item 13)

- **Two layers, one service** (Decision 8.1). `RateLimitService.admit` runs in the guard
  after the token and the request id; `observe` runs in `ExternalRequestLogInterceptor`
  after a check is answered. Nothing else touches the counters.
- **Counters are Postgres** (PRD §23.24): `api_rate_bucket`, `api_rate_counter`,
  `api_abuse_window`, `api_sequence_state`. Each write is one atomic statement in raw SQL
  with `timestamptz` columns. Never read-then-write them outside a lock.
- **Limits are per organisation, from `rate_limit_profile`.** Every number, the detection
  thresholds and the pause included, is a column. Never add a limit as a constant.
  `api_client.daily_quota` is the organisation's own override.
- **A refusal is never counted** against a quota, and every limit refusal answers `429`
  with `Retry-After`, logged with `rate_limited` true.
- **A match never lengthens a sequence**, so a fleet verified in turn is not flagged. Only a
  decided check (`MATCH`, `NO_MATCH`, `INVALID_SIGNATURE`) is observed; a `400` is not. A
  signed code is never passed to sequence detection.
- **A pause is a row in `api_client_pause`**, kept after it ends or is lifted. Pausing
  clears the evidence. Lifting needs `api_client.manage` and a reason.
- **External requests must send `X-Request-ID`** (Requirement 14.5): checked after the token,
  before the limits, logged as `NO_REQUEST_ID`. Every external answer carries
  `X-Server-Request-ID`, stored as `api_request_log.server_request_id`.
- **Test fixtures need a generous profile.** An organisation created in a suite starts on
  `STANDARD` (burst 5), so a suite making many calls gives its organisations a profile of
  its own, as `api-client.e2e-spec.ts` does. The pruning timer does not run under
  `NODE_ENV=test`; suites call `prune()`.

### Officer accounts and the second factor (item 28)

Item 03 built the tables and the guard. Everything that writes to them is item 28.

- **`src/users/` administers; `src/auth/account.service.ts` is the officer's own account.**
  Never take a user id from the request in the second.
- **A temporary password is generated by the System**, returned once, and sets
  `mustChangePassword`. The guard then refuses every route but the `@SignedIn()` ones.
- **Nobody gives what they do not hold** (`escalations`, `PermissionService.heldAt`), and
  **nobody changes their own access** (`notSelf`). An organisation outside the giver's scope
  answers 404.
- **`vehicle.declare`, `payment.manage_settlement`, and `sticker.stock_intake` never go in
  a role**
  (`GRANT_ONLY_PERMISSIONS`). System roles are immutable; the seed owns them.
- **The second factor is asked of the permission** (`SECOND_FACTOR_PERMISSIONS`), and only
  when `auth.mfa_enforced` is true. It ships `false`. **Until it is on, do not describe
  Requirement 17.1 as met.**
- **Secrets:** the TOTP secret is encrypted under `MFA_ENCRYPTION_KEY` (absent means 503,
  never plaintext); recovery codes are stored hashed. Never select `passwordHash`,
  `mfaSecret`, or `mfaPendingSecret` into a response, and never put a password, secret, or
  code in an audit event.
- **A code is accepted once** (`mfaLastStep`), and ten failed sign-ins lock the account for
  fifteen minutes. A locked account answers the same 401.
- **Tests:** `auth.mfa_enforced` is one row for the whole database, so a suite switches it
  by spying on `SettingsService.isEnabled` for its own app, as `users.e2e-spec.ts` does.
  Fixture emails must be lower case.

### Pay now and pay links (item 31)

- **The public pay routes read no dues** (Requirement 27.8, revision 1.9). `GET` and
  `POST /pay/:code` answer with the subject's label and the published amounts, the same
  for every vehicle or member. Never add a field that depends on what is owed, paid, or
  held in credit. `pay-links.e2e-spec.ts` compares an owing vehicle with a paid-up one.
- **They live in the payments module.** `src/verification/` stays read-only. The Verify
  page's Pay now button calls the payments routes, never a verification route.
- **A pay link's code is not a credential** (Decision 9.15). It is stored as it is and
  appears in a URL and a QR code. It still stays out of audit events, and `redactUrl`
  removes it from logged URLs.
- **One live link per subject**, by the partial unique index
  `pay_link_one_live_per_subject`. Preserve it. A link is replaced with a reason, never
  deleted.
- **What a link offers is `PAY_LINK_FEE_TYPES`**: a vehicle its levy, a member the yearly
  fee. Never a sticker fee.
- **The return address must be on the web's own origin** (`CORS_ORIGINS`), or Paystack
  would send a payer anywhere.
- **The limits per address are settings** (`pay_link.views_per_minute`,
  `pay_link.payments_per_hour`), counted in `public_rate_counter`. A suite switches them
  by spying on `SettingsService.getPositiveInteger`, and stubs
  `SettlementService.getActive` as the dedicated-account suite does.
- **`PaymentsService.quote` prices a fee and `initiate` charges it.** A payment from a
  link has no `initiatedByUserId`.
- **A payment Paystack will not start is closed `FAILED` and answers 503**, audited as
  `payment.initiate_failed`. Never leave it `PENDING`: no payment page exists, so nothing
  could ever confirm it. The screens explain a 503 as the provider's, not the payer's.
- **The public sticker page (PRD §23.13) is not built.** It waits on GOV-08, and gets
  the same button when it is.

### The organisation portal (item 29)

An outside organisation applies for itself, and once approved sees its usage and manages
its own tokens (EXT-20). Approval and access stay with `api_client.manage`.

- **Two kinds of session that never cross.** `portal_account` and `portal_session` are
  apart from `user` and `user_session`, with a cookie of their own. The guard reads one
  cookie per kind of route. Never give a portal account a role, grant, or permission, and
  never add a portal route outside `/portal/`.
- **A portal route acts on `request.portalAccount.apiClientId`.** Never take an
  organisation's id from the request there.
- **Applying is not being approved.** `PortalService.apply` always writes `PENDING`. A
  self-application is approved only with `applicantConfirmation` (telephone or letter),
  and lapses after `portal.application_expiry_days`. `sweep()` does that; suites call it.
- **Usage says no more than the API's answers did.** Everything shown goes through
  `portalUsageClass` in `packages/domain`. A forged code counts as a non-match, every
  credential failure is one refusal, and a pause shows when it ends, never its signal.
  Never return `result_class`, a detection threshold, or `api_client_pause.signal` from a
  portal route.
- **Tokens go through `ApiTokenService`** with a `TokenActor` naming the portal account,
  so the locks and checks are the officers'. The audit event names `actorApiClientId`.
- **The application form answers the same for a repeated address**, and is limited through
  `PublicRateLimitService`, the one writer of `public_rate_counter` (the pay page uses it
  too).
- **Secrets:** never select `passwordHash` (use `PORTAL_ACCOUNT_SELECT`), and never put a
  password in an audit event. A temporary password is generated by the System and
  returned once.
- **Tests** switch the limits and the lockout threshold by spying on
  `SettingsService.getPositiveInteger`.

### Organisations and invitations (item 33)

The officers' screens for outside organisations are `/organisations` (the list, the
invitations, one organisation in tabs, profiles, and limits). The addresses under
`/settings/api-access` redirect there.

- **An invitation confirms nobody and lifts no limit** (EXT-21). It opens the portal's form
  addressed to one organisation. Approving an invited application still needs
  `applicantConfirmation`, and the form's limits still apply. Never let a code skip either.
- **Its standing is worked out, never stored** (`invitationStanding` in `packages/domain`).
- **Used once, by one statement.** `InvitationService.useInTransaction` is a conditional
  `updateMany` inside the application's transaction. Never read the invitation and then
  write it. Withdrawing is the same shape.
- **The code is not a credential** (Decision 9.17). It is stored as it is so the link can
  be sent again. It never goes in an audit event, and `redactUrl` removes it from logged
  URLs.
- **`GET /portal/invitations/:code` is public**, and answers the same 404 for an unknown,
  used, expired, or withdrawn code. It is limited by `portal.invitation_views_per_minute`
  (30). A link lasts `portal.invitation_expiry_days` (14). Both fall back in code; a suite
  switches them by spying on `SettingsService.getPositiveInteger`.
- **`GET /api-clients/:id/usage`** gives an officer the portal's own projection
  (`portalUsageClass`), and no more.
- **The System sends nothing.** The invite dialog opens the officer's own WhatsApp, SMS, or
  mail with the message written in, and draws the QR code in the browser.

### Vehicle totals (item 14)

- **Two routes, one scope each** (Requirement 13.8): `GET /aggregates/vehicles/total`
  (exact, refuses any parameter) and `GET /aggregates/vehicles` (filtered). The metadata an
  organisation filters by is `GET /metadata/organisation`.
- **The query schemas are strict.** An unapproved filter is a `400`, never ignored
  (Requirement 13.1). No unit, LGA, or declaration-status filter, ever.
- **The count rule is `isCountedAt`** in `packages/domain/src/aggregate/`;
  `AggregateService.countAt` restates it as a query. Change one, change both.
- **Suppress on the exact count, then round** (`filteredTotal`). The query always runs, so
  a suppressed answer takes the same path, status, and shape (Requirement 13.4). The floor
  and base are settings (`aggregate.suppression_floor`, `aggregate.rounding_base`).
- **No external answer mentions declaration** (Requirement 12.7), not even in the statement.
  The audit event (`aggregate.external.*`) keeps the exact count beside the answer.

### The shell and themes (item 32)

Every signed-in screen sits in `AppFrame` (`components/shell/`): a sidebar, breadcrumbs,
and a command menu. The kit is `components/ui/` (`import { … } from "@/components/ui"`;
dialogs, menus, and the sheet from their own files). See `DESIGN.md` §8–§9 and
`ARCHITECTURE.md` §17.

- **Every colour is a token.** `src/lib/colour-tokens.test.ts` fails on `bg-white`,
  `text-black/60`, a palette colour, a hex value, or a `-[var(--…)]` class. Use
  `bg-surface`, `bg-surface-muted`, `text-muted-foreground`, `text-faint-foreground`,
  `border-line`, `border-line-strong` (a control's outline), `text-link`, `text-brand-text`,
  `bg-primary`, `text-on-solid`, and the verdict utilities.
- **A verdict fill behind white text is `-solid`** (`bg-verdict-deny-solid`). The ink
  (`text-verdict-deny`) is for text on a surface. In the dark theme the two differ, so
  using ink as a fill puts white text on a pale colour.
- **A QR code, or anything printed, sits on `bg-paper`**: white in both themes.
- **A new screen goes in `OFFICER_NAVIGATION` and `OFFICER_LANDING_ORDER`**
  (`lib/navigation.ts`); a test fails if the two disagree. The table is a courtesy, never
  the control.
- **Two landing pages** (item 34, `DESIGN.md` §11). `/` is the public front page: the ways
  in, on one screen. It looks nothing up, and must never grow a search: the System is not
  a directory. It sends an officer whose session cookie is present to Home. Home
  (`/overview`) is one screen of quick actions by permission, with counts from lists the
  officer may already read. Neither adds an API route. A new quick action is a tile there.
- **Pages are built from the kit's page pieces** (`DESIGN.md` §10): `PageHeader`,
  `ListToolbar`, `Table stacked`, `Loading`, `EmptyState`, `Detail`, `Notice`, and a toast
  for success. Build a new screen from them; do not hand-roll a header or a notice box.
- **A record page is tabs kept in the address** (`useTabParam`), with what the record is
  waiting for above them. A tab is offered only where it has something for this officer.
- **A dangerous act goes through `ConfirmDialog`**, which says what will happen and asks
  for the reason there. Never put a reason box beside a danger button, and never share
  one reason box between several acts. `reason={{ optional: true }}` is for an approval's
  note.
- **The command menu reaches screens and actions only.** Never make it search records.
- **The theme script** in `app/layout.tsx` runs before the first paint. If item 15 adds a
  content security policy, allow it by its hash.
- **The web has unit tests** for its pure modules: `pnpm --filter web test`.

### Clicking through the app

There is no browser in the test suite. To drive the real screens, run the built API and
web app against the **local** database and script a browser:

- **Force the API onto the local database.** `apps/api/.env` points at Neon. Export
  `DATABASE_URL` for the local database before `node dist/main.js`; the environment wins
  over `.env`. Confirm by signing in as an account that exists only locally.
- **Check the ports first, and never go through the owner's servers.** The owner may be
  running `pnpm dev` on 3000 and 3001, and that API reads `.env`, so it writes to **Neon**.
  Run your own API and web on free ports (3101 and 3200 worked on 5 October; another
  stack's container takes 3100 whenever it restarts). Build the web with
  `NEXT_PUBLIC_API_BASE_URL` set to your API, because the rewrite is fixed at build time
  (`.next/routes-manifest.json`), and build it again without that afterwards.
- **The local database holds the imported legacy records**, which are real people's.
  Create synthetic records to click through, capture only those, and remove them after.
- **A test administrator** comes from the seed with `SEED_ADMIN_EMAIL` and
  `SEED_ADMIN_PASSWORD` set for one run. Remove the account afterwards.
- **A settlement account left in the local database breaks `payments.e2e-spec.ts`**,
  which expects none. Remove any stand-in before running the suite.
- `playwright-core` with `channel: 'chrome'` drives the installed Chrome; nothing is
  downloaded. Keep the driver outside the repository.
- **A camera without a camera.** Chrome plays a video file as its camera:
  `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream
  --use-file-for-fake-video-capture=<file>.y4m`. A Y4M file is a text header and raw
  frames, so a QR code can be drawn into one with the `qrcode` package and nothing else.
  Headless Chrome on Windows has no `BarcodeDetector`, so this exercises the `jsqr` path.
- **Paystack without Paystack.** `PAYSTACK_BASE_URL` points the API at a stand-in: a small
  local server that answers `/transaction/initialize` and `/transaction/verify/:reference`
  and serves a page with one link that "pays". Give the API a made-up
  `PAYSTACK_SECRET_KEY` of its own. Never use the keys in `apps/api/.env`.
- **Stop your own servers by process, not by port.** On 6 October `netstat` did not show
  the listener, the old web server stayed up through a rebuild, and it served the new
  build's pages with the old build's stylesheet name (a 500). List `node.exe` by command
  line, stop the ones you started, and check a stylesheet answers 200 before clicking.

### Notes that will bite you otherwise

- **`pnpm build` before `pnpm --filter web dev`** on a clean checkout — web imports the
  workspace packages, and they must exist as built output first. Thereafter
  `transpilePackages` in `next.config.ts` compiles them from source.
- **`typecheck` catches what `build` does not.** `nest build` uses
  `tsconfig.build.json`, which excludes tests, so a type error in a spec file only
  surfaces under `pnpm typecheck`. Run it before declaring an item done.
- **The API listens on 3001**, the web app on 3000, so both run together.
- `apps/api/tsconfig.json` deliberately does not extend `tsconfig.base.json` — Nest needs
  `emitDecoratorMetadata` and `strictPropertyInitialization: false` for dependency
  injection, and inheriting the base's stricter settings breaks it.
- `apps/web/AGENTS.md` is regenerated by `next dev`. Do not delete it; commit changes to
  it with your work to keep the tree clean.
