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

- **Not a revenue or levy-collection platform.** The legacy export contains wallets and
  transactions; they are deliberately out of scope and are not migrated.
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
   declaration, sticker, card, or member tables. See PRD §9.5–9.6.
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
  `company_charges.csv` — revenue data, out of scope per PRD §2.

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
- **Legacy barcodes resolve as fully equivalent, by determination.** They are a millisecond
  epoch timestamp and are forgeable by inspection; the owner accepted this to preserve
  2,408 stickers already in the field. Read-only: the issuance path must have no route
  capable of producing one. Record which scheme resolved each verification. See PRD §26.4.
- **Authorisation asks for a permission, never a role.** Code checks `vehicle.declare`, not
  "is this user a Vehicle-Record Officer". Roles are administrative bundles. Every
  assignment carries an organisational scope, and revocation always beats grant. See
  `ARCHITECTURE.md` Decisions 9.2–9.9.
- **API is versioned from day one**: `/api/v1/...`. Never break v1; add v2.
- **Status fields are enums with explicit lifecycles**, not booleans. Card and sticker
  statuses are enumerated in PRD §8 and §10.
- Tokens are stored hashed, shown once at creation/rotation, and never appear in URLs,
  QR payloads, logs, or error messages.

## Designed for upgrades

The following choices exist to preserve future options. They are to be respected rather
than optimised away:

- **Modular monolith, service-shaped.** One Nest module per PRD §19 module, communicating
  through injected services with explicit interfaces — so any module can be extracted
  into its own deployable later without a rewrite.
- **Disclosure profiles are data, not code.** Adding an external organization type must
  never require a deploy.
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
apps/web        Next.js 16 App Router · React 19 · Tailwind v4 · eslint
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
- `@Public()` — health, login, logout, and the QR verification page only.

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

### Validation and the API reference

**Request bodies are validated by zod schemas in `packages/contracts`**, applied per route
with `@Body(new ZodValidationPipe(schema))`. Unknown keys are stripped, so a caller cannot
smuggle `path` or `isActive` into a write. The web application reuses the same schemas, so
one definition governs both sides.

**Every route carries `@Documented({...})`.** The OpenAPI document is generated by reading
the real Nest route table and the same schemas, so it cannot describe a route that does not
exist — and `test/openapi.e2e-spec.ts` fails when a route carries no documentation, or when
the public surface grows beyond health, login, and logout.

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
  both by definition. `membership_application` does not even record who created it, so the
  check could not be made today. Enforcing four-eyes is open at `QUESTIONS.md` **MEM-04**;
  until it is answered, do not describe this as a segregation-of-duties control, because it
  is not one.
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
