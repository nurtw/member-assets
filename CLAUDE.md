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
                 +
            DESIGN.md
       (visual identity, verdict
        legibility, card fidelity)
```

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

PRD §23 lists the questions NURTW must answer before parts of this can be built
(hierarchy semantics, number formats, expiry policy, whether digital signatures are
accepted, which external org types get access). **Do not invent answers.** If an item is
blocked on one, record it in HANDOFF.md under "Conflicts" and build the surrounding work.

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

Prisma commands arrive with roadmap item 02; the database is not yet wired.

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
