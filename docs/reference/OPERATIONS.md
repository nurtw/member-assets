# Operations Runbook

## NURTW Membership and Vehicle Verification System

**Last revised:** 3 October 2026

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

### After every migration, verify the partial indexes survived

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

Two further partial indexes were added at item 06 and are subject to the same rule:

```sql
SELECT indexname, indexdef FROM pg_indexes
 WHERE indexname IN (
   'vehicle_one_active_declaration_per_plate',
   'card_one_live_per_member',
   'officer_signature_one_active_per_position'
 );
```

All three must be present after every migration.

| Index | What it prevents |
|---|---|
| `card_one_live_per_member` | Two credentials answering for one member. Covers `ISSUED` and `ACTIVE`; `EXPIRED`, `REPLACED`, `LOST`, and `CANCELLED` accumulate without limit, which is PRD Requirement 8.1 |
| `officer_signature_one_active_per_position` | Two active president signatures, which would make "which signature was this card composited from" a matter of query ordering |

Item 23 adds `dedicated_account_one_active_per_member` (`WHERE active`). Without it, two
officers assigning at once could give one member two dedicated accounts, and transfers
into either would still credit them, but the screen would show only one.

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
| `PAYSTACK_SECRET_KEY` | For payments | A test key (`sk_test_…`) everywhere except production. Also verifies the webhook signature |
| `PAYSTACK_DVA_PREFERRED_BANK` | No | The bank dedicated accounts are opened with (item 23). `test-bank` in test mode; a provider slug such as `wema-bank` in live mode. Unset lets Paystack choose |
| `CLOUDINARY_URL` | No | Selects `CloudinaryStorage` over the local-filesystem adapter for uploaded media (`media.module.ts`). Unset in development stores under `MEDIA_STORAGE_DIR` on disk instead — set this in production, since a container's filesystem does not survive a redeploy. |
| `MEDIA_STORAGE_DIR` | No | Local-filesystem adapter only; ignored once `CLOUDINARY_URL` is set. Default `var/media` |
| `MEDIA_URL_SIGNING_SECRET` | No | Falls back to a value generated at startup, which invalidates outstanding signed media links on restart |

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

### Requiring a second officer to approve

`system_setting` key **`approval.require_separate_officer`**, shipped `false`.

When `true`, the officer who recorded a membership application may not decide it,
and the officer who prepared a card may not approve it. When `false`, one user
holding both permissions may do both — and the super administrator holds both by
definition.

**It ships off deliberately.** `QUESTIONS.md` **MEM-04** asks the Union whether a
second approval is required, and with a single administrator account on the
System, enforcing it would make a registration impossible to complete. The control
is built so that the answer is a settings change rather than a migration.

```sql
-- Turn it on.
UPDATE system_setting
   SET value = 'true', updated_at = now()
 WHERE key = 'approval.require_separate_officer';
```

It takes effect on the **next request** — the setting is read per decision and
not cached, precisely so that turning it on is immediate.

Two things it deliberately does not do. It does not block *returning a card for
amendment*, which creates nothing and grants nobody anything, so a preparer may
still correct their own draft. And where the recording officer is unknown — an
application predating the column whose audit event has been purged — it allows
the decision, because the System cannot prove one person is acting twice and
refusing on a suspicion would strand the record.

### Setting the go-live date for dues

`system_setting` key **`dues.go_live_date`**, written as `YYYY-MM-DD`. It **ships unset**.

PRD Requirement 27.13: a member migrated from the previous system first owes the
membership fee on the go-live date. Until the date is set, those members read
"Not started" on every screen, rather than being charged from a day nobody chose.
`QUESTIONS.md` **GOV-11** asks the Union for the date.

```sql
-- Once GOV-11 is answered. Read as the start of that day in Lagos.
INSERT INTO system_setting (key, value, description, updated_at)
VALUES ('dues.go_live_date', '2026-11-01',
        'Go-live date (GOV-11): migrated members first owe the membership fee on it.', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
```

Like every setting, it is read per request, so it takes effect at once. A value
that is not a `YYYY-MM-DD` date reads as unset.

### Changing a fee amount

Always through the Fees settings page or `/fee-types`, never by editing
`fee_type` or `fee_type_price` directly. Each change appends to
`fee_amount_history` in the same transaction, and that history is what prices
each past month of levy at the amount in force when it fell due (item 22). A
direct edit leaves no history row, so the System would treat the new amount as
having applied all along, and every month already paid would show a shortfall.

### Switching on dedicated accounts

A dedicated account cannot be assigned until both of these exist: the NURTW settlement
account, and the contractor percentage of dedicated-account money (item 23). The
percentage **ships unset**, because `QUESTIONS.md` **PAY-11** says Paystack's
dedicated-account pricing must first be confirmed from the dashboard.

1. Confirm the pricing in the Paystack dashboard. Choose a percentage that covers
   Paystack's dedicated-account fee plus the contractor's share: Paystack takes its fee
   out of that percentage, not on top of it.
2. Set it with a super administrator's session, the password, and a reason:

   ```http
   PUT /api/v1/payments/settlement/dedicated-percentage
   { "percentage": 1.5, "password": "…", "reason": "Pricing confirmed from the dashboard" }
   ```

   This updates the NURTW subaccount's `percentage_charge` at Paystack first, then the
   `payments.dedicated_account.contractor_percentage` setting. **Never edit that setting
   directly**: the two would disagree, and members would be credited at a rate Paystack is
   not applying. Payment links are unaffected, because each one sends its own split.
3. Set `PAYSTACK_DVA_PREFERRED_BANK` (`test-bank` in test mode) and redeploy the API.
4. In test mode, assign an account to a test member from their application page, and pay
   into it from the Paystack dashboard. Then check two things:
   - The transfer's `credit_basis` reads `PAYSTACK_SPLIT`. If it reads `PERCENTAGE_SETTING`,
     Paystack's verified transaction carried no split figure, and the System worked the
     credit out itself.
   - The credit equals the amount sent less the percentage.

   If Paystack refuses to open the account for want of identification, see `QUESTIONS.md`
   **PAY-20** before going further.

**Money nobody was credited for.** A transfer that matches no dedicated account is
audited as `payment.dedicated.unmatched` rather than refused, because Paystack would only
send it again. Look for these after any account is deactivated at Paystack:

```sql
SELECT created_at, after_value FROM audit_event
 WHERE action = 'payment.dedicated.unmatched' ORDER BY created_at DESC;
```

**Held credit.** Money beyond what is owed is held, and an hourly job inside the API pays
it into dues as they fall, so a member who sends two months' levy at once has the second
month paid within the hour of it falling due. The order dues are paid in is the
`payments.dedicated_account.allocation_order` setting, `OLDEST_FIRST` as PAY-12 answered.

### Reviewing verifications

Every check on the Verify screen writes one audit event, named after what the officer
entered: `verification.plate`, `verification.sticker`, `verification.combined`, or
`verification.membership` for a card. The event records the outcome and every reason. Its
request id is the reference the officer sees.

The event always holds the true reasons. The officer's screen says a vehicle is not declared
only to a holder of `vehicle.declare`; anyone else reads that its record is not complete
(`QUESTIONS.md` VEH-28).

A signed code that fails its signature writes `verification.invalid_signature` instead. That
event records the code as entered, and no record was looked up for it.

Codes that failed their signature (forgeries or misreads), by officer, over the last 30 days:

```sql
SELECT actor_user_id, count(*) FROM audit_event
 WHERE action = 'verification.invalid_signature'
   AND created_at > now() - interval '30 days'
 GROUP BY actor_user_id ORDER BY count(*) DESC;
```

How often Transpay barcodes are still presented, which PRD §26.4 asks the Union to measure:

```sql
SELECT after_value->>'scheme' AS scheme, count(*) FROM audit_event
 WHERE action IN ('verification.sticker', 'verification.combined')
 GROUP BY 1;
```

**Signed stickers need `STICKER_SIGNING_SECRET`.** Without it, a signed code answers 503 and
is not recorded as a forgery. Plates and Transpay barcodes still verify. New NURTW stickers
are paused for now (`QUESTIONS.md` VEH-20), so the secret is not yet needed.

### Reissuing a vehicle letter

When a vehicle's details change after onboarding, for example a driver is linked or the
vehicle moves unit, an officer holding `sticker.attach` reissues the letter from the
vehicle's page, giving a reason (`QUESTIONS.md` VEH-27). The new letter has a new reference.
The old one is kept exactly as printed and no longer downloads. Letters replaced this way:

```sql
SELECT l.letter_reference, l.superseded_at, n.letter_reference AS replaced_by,
       n.reissue_reason
  FROM vehicle_letter AS l
  JOIN vehicle_letter AS n ON n.replaces_letter_id = l.id
 ORDER BY l.superseded_at DESC;
```

### Admitting an external organisation

From **API access** on the dashboard, or `/api/v1/api-clients`. Three acts, in this order:

1. **Register** it (`api_client.manage`): the organisation, its purpose, its technical
   contact, and any address ranges it will call from. It is pending and can do nothing.
2. **Approve** it (`api_client.manage`): choose a disclosure profile and only the scopes its
   purpose needs, and record the data-sharing agreement's reference and signing date. No
   agreement, no approval (`QUESTIONS.md` EXT-07). The approving officer is recorded.
3. **Issue a token** (`api_token.manage`). It is shown once. Copy it and pass it to the
   technical contact by a secure route. The System keeps only a hash, so nobody can show it
   again: a lost token is replaced, never recovered.

The organisation sends the token as `Authorization: Bearer <token>` and in no other way. A
token in a URL or a cookie is ignored, and is redacted from the logs.

### Replacing and revoking API tokens

- A token lasts 90 days (`api_token.expiry_days`). From 14 days before it expires
  (`api_token.reminder_days`), the API access screen flags it. Contact the organisation,
  replace the token, and pass the new one on. The System sends no email yet
  (`QUESTIONS.md` EXT-10).
- **Replace** keeps the old token working for the overlap chosen: none, 1 hour, 24 hours, or
  7 days (EXT-11). Each token shows when it was last used, so you can see when the
  organisation has switched.
- **Revoke** a token that may have leaked. It stops on the next request.
- **Suspend** the organisation to refuse its tokens while something is looked into.
  Reinstating it restores the same tokens. **Revoke access** is final and revokes every
  token it holds.

### Finding why an external request was refused

The organisation is told only `401` or `403`, with a request id. The reason is in
`api_request_log`, which never holds the token:

```sql
SELECT created_at, endpoint, scope, result_class, status_code, ip_address
  FROM api_request_log
 WHERE request_id = '<request id the organisation quotes>'
    OR client_id = '<client id>'
 ORDER BY created_at DESC
 LIMIT 50;
```

`result_class` is one of `NO_TOKEN`, `MALFORMED_TOKEN`, `UNKNOWN_TOKEN`, `TOKEN_REVOKED`,
`TOKEN_REPLACED`, `TOKEN_EXPIRED`, `CLIENT_NOT_ACTIVE`, `ADDRESS_NOT_ALLOWED`, or
`SCOPE_DENIED`. A request carrying no token the System issued has no `client_id`.

### Changing what a disclosure profile discloses

The four standard profiles of PRD §15 cannot be changed. Compose a new profile under
**Disclosure profiles**, then move organisations onto it, or amend a profile the Union
composed. A change of fields applies to every organisation holding the profile from its next
request, and the audit event records how many that was. A profile can name only fields an
outside organisation may be told, and one still held by an organisation cannot be withdrawn.

### Finding work approved by the officer who recorded it

Useful before turning the setting on, to see how often it happens today.

```sql
SELECT a.application_number, a.status, a.reviewed_at
  FROM membership_application AS a
 WHERE a.created_by_user_id IS NOT NULL
   AND a.created_by_user_id = a.reviewed_by_user_id;

SELECT c.card_number, c.status, c.issue_date
  FROM card AS c
 WHERE c.issued_by_user_id IS NOT NULL
   AND c.issued_by_user_id = c.approved_by_user_id;
```

### Preparing the Union's own card artwork

**Before any card is printed for a member**, `QUESTIONS.md` **CARD-05** must be
answered and a new template version cut. The template shipped at item 06 is
`v1-provisional`: its geometry is correct (ISO/IEC 7810 ID-1) but its colours are
inferred from a daylight photograph, and it prints
`PROVISIONAL TEMPLATE — ARTWORK PENDING` across the foot of every card to say so.

The procedure when the artwork arrives:

1. Add a **new** template module under `apps/api/src/card/templates/`, registered
   in `registry.ts`, and point `CURRENT_TEMPLATE_VERSION` at it.
2. **Do not edit or delete `v1-provisional`.** Any card issued against it renders
   through it, and a reprint of a damaged card must match the original.
   `registry.spec.ts` names every version ever issued and fails if one disappears.
3. Set `validityMonths` from the Union's answer to **CARD-04**. It is `null`
   today, which means cards do not expire.
4. Register the officer signature assets (**CARD-07**) before issuing under the
   new template — see below.

### Registering an officer signature

PRD §23.7. Requires `card_template.manage`, and every change is audited: a forged
signature asset would forge every card issued after it.

```bash
# 1. Upload the image. The bytes decide the type; JPEG or PNG only, because a
#    card cannot embed WebP.
curl -X POST "$API/media?kind=OFFICER_SIGNATURE" -b cookies.txt -F file=@president.png

# 2. Register it against the position, which supersedes whatever held it.
curl -X POST "$API/officer-signatures" -b cookies.txt -H 'Content-Type: application/json' \
  -d '{"position":"PRESIDENT","officerName":"...","officerTitle":"President","mediaAssetId":"..."}'
```

Superseding is not deleting. The previous record stays, inactive, so that cards
issued under a president who has since left office remain explicable.

**A position may legitimately be vacant.** Cards issued while it is carry a blank
signature line, and the audit event for each issuance records
`officerSignaturesPresent: false` — which is how to find them afterwards.

### Finding cards issued without officer signatures

```sql
SELECT subject_id, created_at
  FROM audit_event
 WHERE action = 'card.issue'
   AND after_value ->> 'officerSignaturesPresent' = 'false'
 ORDER BY created_at;
```

Every card in that list was issued before **CARD-07** was answered and will need
replacing once the signatures are registered.

### Running the legacy import

The script reads `data/` (never committed). It writes three things:

- members;
- on-record vehicles with their owner details (PRD §25, Requirement 25.4);
- the closed Transpay register: 2,408 legacy barcodes as unattached stickers, each bound to
  the plate the export records for it (Requirement 9A.3).

It runs **against a local database first**
(`QUESTIONS.md` MIG-07). Override `DATABASE_URL` on the command line rather than editing
`apps/api/.env`; `--env-file` never overrides a variable already set:

```bash
docker compose up -d
export LOCAL=postgresql://nurtw:nurtw_local_dev@localhost:5433/nurtw
DATABASE_URL=$LOCAL pnpm --filter api db:deploy
DATABASE_URL=$LOCAL pnpm --filter api db:seed
DATABASE_URL=$LOCAL pnpm --filter api migrate:legacy
```

The reconciliation report lands in `.migration-reports/` (gitignored). It lists rows by
legacy id and plate only, with no names, phones, or addresses. A rerun writes nothing.

**`--repair`** corrects rows written by the pre-revision-1.2 script, which marked legacy
vehicles as declared and recorded no owner. It moves them to on record, clears the
declaration date, and adds owner details from the export. Each row gets one
`vehicle.migrate_repair` audit event. Rows an officer has since declared or re-statused
are left as they are, and driver links are never touched. A second run writes nothing.

```bash
pnpm --filter api migrate:legacy -- --repair
```

The shared Neon database was imported by the pre-1.2 script on 18 September 2026 and needed
this repair. The owner approved it on 26 September 2026. The repair is safe to interrupt:

- rows already corrected are skipped, from one query at the start;
- each remaining row is re-read and decided inside its own transaction, so a retry after a
  dropped connection never writes twice;
- repairs run five at a time, and a dropped connection is retried.

**Any run of the current script also loads the Transpay register,** unless it is given
`--no-register`:

```bash
pnpm --filter api migrate:legacy -- --repair --no-register
```

Loading the register onto Neon is a separate go-ahead (MIG-07). The local report shows
2,408 barcodes placed and none failed.
The register is the only place a legacy barcode is ever written, and nothing in the API can
add to it. The security code is stored as a record only and appears in no response
(Requirement 9A.5).

---

## 11. Regenerating the API reference

After any change to routes, permissions, or request schemas:

```bash
pnpm --filter api docs:openapi   # rewrites docs/reference/openapi.json
```

Commit the result. The end-to-end suite fails if a route carries no documentation, so this
cannot be forgotten silently.
