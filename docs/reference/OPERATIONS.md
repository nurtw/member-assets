# Operations Runbook

## NURTW Membership and Vehicle Verification System

**Last revised:** 9 September 2026

---

## 1. Scope of this document

How to run, deploy, and recover the System. It is written for whoever is on duty, including
someone who did not build it. Where a procedure is destructive, the consequence is stated
before the command.

Sections marked **NOT YET IMPLEMENTED** describe procedures that become applicable at a
later roadmap item. They are listed rather than omitted so that the gap is visible.

---

## 2. Components

| Component | Runs on | Notes |
|---|---|---|
| API (NestJS) | DigitalOcean, containerised | Listens on `PORT`, default 3001 |
| Web (Next.js) | Vercel | Officer dashboard and verification portal |
| Database | Neon PostgreSQL, EU region | Branch-per-preview |

The container is deliberately cloud-agnostic: all configuration arrives through environment
variables, and no DigitalOcean- or Vercel-specific interface is called from domain code. The
System can be moved between providers without a rewrite.

---

## 3. Local development

Node ≥ 22, pnpm ≥ 10, Docker.

```bash
pnpm install
docker compose up -d              # PostgreSQL 17 on port 5433 — wait for healthy
cp .env.example apps/api/.env     # then set DATABASE_URL
pnpm --filter api db:migrate
pnpm --filter api db:seed
pnpm build                        # required once: web imports the workspace packages
pnpm dev
```

The API serves on 3001 and the web application on 3000.

**Port 5433, not 5432.** The default is occupied by an unrelated stack on the maintainer's
machine. A shared default port is how two projects end up writing to one another's
database.

### Verifying a change before declaring it done

```bash
pnpm test         # unit and integration
pnpm typecheck    # catches what build does not — the build excludes test files
pnpm lint
pnpm --filter api test:e2e
```

`typecheck` is not redundant with `build`. `nest build` uses `tsconfig.build.json`, which
excludes tests, so a type error in a spec file surfaces only under `typecheck`.

---

## 4. Creating the first administrator

The seed creates **no default administrator**, deliberately: a known credential in a seed
script reaches production far more often than anyone expects, and this account holds
`vehicle.declare` and every other permission in the catalogue.

```bash
# Set for one run only, then remove from the environment.
SEED_ADMIN_EMAIL=<address> SEED_ADMIN_PASSWORD=<generated> pnpm --filter api db:seed
```

The password must be at least 12 characters. Generate it rather than choosing it, and
deliver it through a channel separate from the address. The seed is idempotent and will not
overwrite an administrator that already exists.

Confirm afterwards, and record the result:

```bash
curl -s "$API/auth/holders?permission=vehicle.declare" -b cookies.txt
```

---

## 5. Database

```bash
pnpm --filter api db:migrate      # create and apply a migration (development)
pnpm --filter api db:deploy       # apply pending migrations (production)
pnpm --filter api db:status       # what is applied versus pending
pnpm --filter api db:generate     # regenerate the client after a schema edit
pnpm --filter api db:studio       # browse data
```

### After every migration, verify the partial index survived

PRD §9.2 allows at most one **ACTIVE** declaration per normalised plate while history stays
open. Prisma cannot express a partial unique index in the schema, so it is raw SQL appended
to the initial migration and is **not** regenerated:

```sql
SELECT indexdef FROM pg_indexes
 WHERE indexname = 'vehicle_one_active_declaration_per_plate';
```

The definition must still carry `WHERE (status = 'ACTIVE'::"VehicleStatus")`. If it is
absent, the database will accept two active declarations for one plate.

A plain `@@unique([plateNumberNormalized, status])` is **not equivalent and is wrong**: it
permits only one row per status per plate, so a vehicle could be retired exactly once and
never again.

### Destructive commands

`prisma migrate reset` **drops every table and all data**. It is gated behind an
explicit-consent prompt; do not bypass that prompt. In local development, drop the container
instead:

```bash
docker compose down -v && docker compose up -d
```

Never run either against production.

### Prisma version constraint

Both `prisma` and `@prisma/client` are pinned to **7.10.0**. The `latest` tag on npm is an
8.0 release candidate; installing it desynchronises the CLI from the client. Do not run
`prisma@latest`.

---

## 6. Configuration

All configuration is environment variables; see `.env.example` for the full annotated list.
The API **refuses to start without `DATABASE_URL`**, by design — a service that starts
without its database and fails per request is harder to diagnose than one that does not
start.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Startup fails without it |
| `PORT` | No | Default 3001 |
| `CORS_ORIGINS` | No | Comma-separated; empty permits none |
| `NODE_ENV` | No | `production` enables `secure` cookies |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | No | One run only, then remove |
| `STICKER_SIGNING_SECRET` / `STICKER_SIGNING_KEY_ID` | From item 08 | Never reaches the web application or a QR payload |

### Secrets that must never be logged or exported

API tokens, passport images, signatures, guarantor details, chassis and VIN numbers,
internal notes, the sticker signing secret, and password hashes. Nothing in this list may
appear in a log line, an error message, a URL, a QR payload, or a support ticket.

---

## 7. Deployment

**NOT YET IMPLEMENTED — roadmap item 15.** Provisioning, the release pipeline, and rollback
are established at go-live hardening. What is fixed already:

- Migrations run with `db:deploy`, never `db:migrate`, against production.
- Migrations are applied **before** the new image serves traffic.
- The container reads configuration from the environment; no configuration is baked in.
- Production data resides in an **EU region** (London or Frankfurt), per Decision 10.4.

> **Outstanding governance action.** Storing Nigerian members' personal data outside Nigeria
> is a cross-border transfer under the Nigeria Data Protection Act 2023. The Union's lawful
> basis for that transfer is not yet recorded. This is a Union governance action, not an
> engineering task, and it is **due before go-live**.

---

## 8. Backup and restoration

**NOT YET IMPLEMENTED — roadmap item 15.** Required before go-live:

- Automated daily backup with point-in-time recovery, retained per PRD §22.
- A **restoration rehearsal**, performed and timed against a non-production environment. A
  backup that has never been restored is not a backup.
- Documented recovery point and recovery time objectives, agreed with the Union.

---

## 9. Monitoring and incident response

**NOT YET IMPLEMENTED — roadmap item 15.** Required before go-live: uptime and error-rate
alerting, an on-call contact, and an incident-response document naming who declares an
incident and who notifies the Union.

### Health

`GET /api/v1/health` is unauthenticated and answers `200` when healthy, `503` when degraded.

It reports **only** `status` and `timestamp`. It carries no version, hostname, dependency
name, uptime, or build identifier, because anything disclosed there is disclosed to
everyone, including someone probing for an exploitable dependency version. The database is
checked but never described: a caller learns that the service is degraded, not which
component failed. Where richer diagnostics are needed, add a second **authenticated**
endpoint rather than enriching this one.

---

## 10. Routine procedures

### Suspending a user's access immediately

Delete the user's sessions. Revocation takes effect on the **next** request — this is the
property for which opaque sessions were chosen over signed tokens.

### Withdrawing a permission from one user

Record a revocation rather than removing the role. Revocation always beats grant, applies
immediately, and leaves the role assignment intact and legible.

### Establishing who holds a sensitive permission

```bash
GET /api/v1/auth/holders?permission=vehicle.declare
```

Answers across role bundles, per-user grants, and per-user revocations, with revocations
applied. `vehicle.declare` belongs to the super administrator alone and to those the super
administrator expressly grants it to; it is in **no other role bundle**.

### Dissolving a unit or branch

Deactivate, never delete. Deactivation is refused while active children or active members
remain, so work bottom-up: reassign members, deactivate child nodes, then the node itself.
A reason is required and is recorded.

### Correcting master data

Labels and sort order are editable; **codes are not**. A code is a foreign key in all but
name, referenced by the legacy import mapping and by operational queries. To withdraw a
value, deactivate it — existing references stay intact and the value stops being offered
for new records.

---

## 11. Regenerating the API reference

After any change to routes, permissions, or request schemas:

```bash
pnpm --filter api docs:openapi   # rewrites docs/reference/openapi.json
```

Commit the result. The end-to-end suite fails if a route carries no documentation, so this
cannot be forgotten silently.
