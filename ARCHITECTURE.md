# Architecture and Technical Decisions

## NURTW Membership and Vehicle Verification System

**Document version:** 1.1
**Last revised:** 9 September 2026
**Authority:** Subordinate to `PRD.md`. Where this document and the PRD conflict, the PRD prevails.

---

## 1. Purpose

This document records the technical constraints and decisions that govern implementation.
It is binding on plans in `plans/`. A plan may not depart from a decision recorded here
without that departure being raised in `HANDOFF.md` and the decision formally revised.

---

## 2. Technology selection

| Layer | Selection | Basis |
|---|---|---|
| API | NestJS (TypeScript) | Directed by the owner. Its module system maps cleanly onto the fifteen modules of PRD §19, and its guard and interceptor model expresses scope enforcement, rate limiting, and audit capture as first-class concerns. |
| Web | Next.js (App Router) | Directed by the owner. Serves the internal dashboard and the officer verification portal. |
| ORM | Prisma | Selected by the owner. The schema is the single source of truth; the migration history serves as a durable record of structural change. |
| Database | PostgreSQL (Neon) | The legacy export is PostgreSQL. Neon's branching supports a database branch per preview deployment. |
| API hosting | DigitalOcean | Selected by the owner. Deployed as a container. |
| Web hosting | Vercel | Selected by the owner. |

---

## 3. Repository layout

A single repository containing both applications. The Union is one client with one
delivery timeline; separate repositories would impose coordination cost without benefit.

```
nurtw/
  apps/
    api/                  NestJS application
      src/
        modules/          One directory per PRD §19 module
        common/           Guards, interceptors, filters, decorators
        config/           Environment schema and typed configuration
      prisma/
        schema.prisma     Single source of truth for the data model
        migrations/
        seed.ts
      test/
    web/                  Next.js application
      app/
      components/
      lib/
  packages/
    contracts/            Shared DTOs, enumerations, and Zod schemas
    domain/               Framework-independent domain rules
  scripts/
    migrate-legacy/       Legacy import (roadmap item 09)
  docs/                   Union source documents
  plans/                  Per-item implementation plans
  data/                   Legacy export. Not under version control.
```

**Decision 3.1.** `packages/contracts` is consumed by both applications. API response
types are declared once and imported by the web application, so that a change to a
response shape produces a compile error rather than a runtime defect.

**Decision 3.2.** `packages/domain` holds rules that must not depend on NestJS, Prisma, or
Next.js — plate normalisation, disclosure projection, status-transition validity, and
identifier generation. This keeps the rules that carry the greatest correctness risk
independently testable and portable should the framework change.

---

## 4. Module boundaries

The fifteen modules of PRD §19 are realised as NestJS modules. Modules communicate only
through injected services with declared interfaces. No module reaches into another
module's Prisma models directly.

| Module | Responsibility |
|---|---|
| `organization` | Council, zone, branch, unit; master data |
| `membership` | Applications, review, approval, member status |
| `member-profile` | Member records, next of kin, guarantor |
| `card` | Card templates, issuance, replacement, status |
| `vehicle` | Declarations, plate normalisation, conflict detection |
| `sticker` | Stock, QR identifier generation, issuance, replacement |
| `verification` | Plate, QR, combined, and membership verification |
| `api-client` | External client registration, tokens, rotation |
| `disclosure` | Scopes, profiles, response projection |
| `aggregate` | Declared-vehicle totals and suppression |
| `rate-limit` | Quotas, limits, enumeration and brute-force detection |
| `audit` | Audit events and security monitoring |
| `reporting` | Operational dashboards |
| `admin` | Configuration, backup, restoration |
| `auth` | Authentication, roles, multi-factor authentication |

**Decision 4.1 — modular monolith, service-shaped.** The System deploys as a single
process. Each module is nonetheless constructed as though it were independently
deployable: no shared mutable state, no cross-module database joins, and all
inter-module access mediated by an interface. Should verification volume later warrant
extraction of the `verification` and `rate-limit` modules into a separately scaled
service, that extraction becomes a deployment change rather than a rewrite.

**Decision 4.2.** Cross-module reads that would otherwise require a join are served by an
explicit query method on the owning module's service. Where this proves materially
expensive, a read model is introduced rather than the boundary being breached.

---

## 5. Verification and disclosure

This is the correctness-critical path of the System. PRD §15 requires that responses be
constructed by projection.

**Decision 5.1 — projection, not redaction.** A verification response is assembled by
reading the caller's disclosure profile and populating only the fields that profile
permits. A complete record is never retrieved and subsequently stripped. Redaction fails
unsafely: a field added to the model later is disclosed by default. Projection fails
safely: a new field is withheld until a profile expressly admits it.

**Decision 5.2 — profiles are rows, not code.** Disclosure profiles, their permitted field
sets, and the mapping from scope to profile are database records administered through the
`disclosure` module. Admitting a new class of external organisation is a configuration
action, not a release.

**Decision 5.3 — a single projection function.** All four verification endpoints pass
through one projection implementation in `packages/domain`. It is exhaustively tested
against every profile. A field cannot reach a response by any other route.

**Decision 5.4 — generic negative responses.** A non-match returns an identical response
irrespective of cause: unknown identifier, suspended record, or out-of-scope request. The
distinction is recorded in the audit trail and withheld from the caller, so that responses
cannot be used to probe the boundary of the record set.

---

## 6. Identifiers

**Decision 6.1 — plate normalisation.** Normalisation converts to upper case and removes
all non-alphanumeric characters. `plate_number_normalized` carries the unique index and is
the sole field used in lookup. `plate_number_display` preserves the value as entered. The
normalisation function resides in `packages/domain` and is applied at the boundary, so no
unnormalised value can be written.

**Decision 6.2 — opaque, memorable identifiers with a signed QR payload.** Determined
9 September 2026; specified at PRD §26.

Identifiers are generated from a cryptographically secure random source and rendered in a
grouped alphabet excluding characters liable to confusion in handwriting or speech, so that
a value may be dictated by telephone without error. They carry no sequence, no branch, and
no timestamp: a member transferring branch retains their identifier, and no observer may
infer the size of the register.

The QR payload carries the identifier, a key identifier, and a truncated HMAC computed with
a server-held secret.

**Decision 6.2.1 — validate the signature before touching the database.** An invalid
signature is a forgery attempt, not a lookup miss. It is rejected and recorded as such
without a query being issued. This also makes brute-force attempts cheap to absorb: an
unsigned guess costs a hash, not a database round trip.

**Decision 6.2.2 — the secret never leaves the server.** It is held by the issuing and
verification services alone, and is absent from the web application, from client-delivered
code, from QR payloads, and from every log. The key identifier in the payload permits
rotation without invalidating stickers already issued.

**Decision 6.2.3 — a signature is necessary, never sufficient.** Signature validity proves
the code was minted by the Union. It does not prove the sticker is on the right vehicle, nor
that it remains valid. Every positive verification additionally requires an active record of
good status, and combined verification additionally requires the plate to match. See
PRD §26.3, which sets out precisely which attack each control addresses.

**Decision 6.3 — number-generation strategies remain pluggable.** Although the format is now
determined, each identifier class is produced by a named strategy resolved from
configuration. A future change of format is then a configuration change affecting new
issuance only, never a migration of existing records.

**Decision 6.4 — legacy identifiers resolve as equivalent; risk recorded.** Per PRD §26.4,
the 2,408 barcodes issued under the previous system verify identically to signed
identifiers. The owner was advised that the legacy scheme is a millisecond epoch timestamp,
deducible from a single genuine sticker and carrying no authenticity proof, and determined
that field continuity outweighs the residual risk.

> **Superseded in part by revision 1.2 (22 September 2026).** "Resolve as equivalent" no
> longer means *readable without further action*. A legacy barcode now resolves only once
> reattached under Requirement 9A.4's four conditions — see Decision 6.5. The residual-risk
> reasoning above still explains why field continuity was worth preserving at all; it no
> longer describes the control in effect.

Implementation consequences:

- Legacy identifiers are stored in a distinct, indexed column. They are never generated,
  only read. The issuance path has no code route capable of producing one.
- Every verification records which scheme resolved it, so the Union can quantify legacy
  exposure over time and revisit the determination on evidence rather than argument.
- Legacy identifiers remain subject to plate binding and to the status lifecycle. Those
  controls are not relaxed for them.

**Decision 6.5 — on record, onboarded, and declared are three structurally separate facts
*(revision 1.2)*.** PRD §9A.1 requires each to have its own actor and time, and requires
that none imply another. This is not achievable by adding a flag to the existing
declaration row, because the existing row *is* the declaration — a vehicle with no
declaration cannot be represented by a declaration row carrying a "not really" bit without
every reader of `Vehicle.status` having to learn a second, silent meaning for it.

Structurally:

- **On record** — `DeclarationStatus` gains `ON_RECORD`, a new terminal-ish starting state
  distinct from `PENDING` (which item 07 already reserved, unreached by any code path, for
  a possible future draft-declaration flow — reusing it here would overload one state with
  two unrelated meanings). A migrated vehicle is created at `ON_RECORD` with `declaredAt:
  null` and no `declaredByMemberId`. It is a real `Vehicle` row from the first migration
  run, not a separate staging table — so item 04's existing move/scope machinery, and the
  eventual declaration, both operate on one continuous row rather than a row that gets
  replaced.
- **Declared** — unchanged: `status` reaches `ACTIVE` only via `vehicle.declare` (Decision
  9.7), which stamps `declaredAt` and (optionally) `declaredByMemberId`. The partial unique
  index (§9.2) stays scoped to `WHERE status = 'ACTIVE'`, so an `ON_RECORD` row never
  competes with it.
- **Onboarded** — not a `Vehicle` field at all. A vehicle is onboarded exactly when it has
  a `Sticker` row with `attachedAt` set and `vehicleId` pointing to it (item 08,
  Requirement 10.3). Deriving this from the sticker relation rather than mirroring it onto
  `Vehicle` avoids a second place the two facts can drift apart.

**Consequence for `vehicle.declare` (item 07's existing code, to be revised):** before
creating a fresh row, `declare()` must look for an existing row on the normalised plate —
not only an `ACTIVE` one — and, if it finds one at `ON_RECORD`, promote that same row
(stamping `declaredAt`, `declaredByMemberId`, branch/unit) rather than creating a second
row for the same physical vehicle. Only when no row exists at all, or the existing row is
already `ACTIVE`, does the original create-or-dispute logic apply unchanged. This is what
"declare-first, on-record-vehicles-excluded-until-declared" actually requires in code: a
migrated vehicle must become the SAME record once declared, not a duplicate beside it.

---

## 7. Audit

**Decision 7.1.** Audit capture is implemented as a NestJS interceptor applied to mutating
routes, supplemented by explicit emission from domain services for actions whose
significance is not evident from the route alone. Audit correctness must not depend on an
author remembering to log.

**Decision 7.2.** Audit events are append-only. No application code path updates or
deletes an audit row. Retention is enforced by an administrative process operating outside
the application's write path.

**Decision 7.3.** Audit rows record actor, action, subject, before-and-after values for
material changes, timestamp, request identifier, and stated reason for overrides. They
must not record token values, images, signatures, or guarantor details.

---

## 8. Rate limiting

**Decision 8.1 — two distinct layers.** Quota enforcement (requests per minute, per hour,
per day) is separate from abuse detection (enumeration patterns, brute force, anomalous
error rates). PRD §14.2 requires that a client within its quota still be blocked from
systematically testing identifiers; a single counter cannot express this.

**Decision 8.2 — state is external to the process.** Counters and detection state are held
in Redis or an equivalent shared store, not in process memory, so that limits hold across
instances and survive restart. This is a precondition of horizontal scaling, and is
therefore adopted before scaling is required rather than after.

**Decision 8.3 — limits are runtime configuration.** Per PRD §14.1, every limit, quota, and
suppression threshold is administered through the interface. No limit is a code constant.

---

## 9. Authentication and access control

**Decision 9.1.** Internal user authentication and external client authentication are
separate mechanisms with separate credential stores. An internal session must never
authenticate an API call, and an API token must never authenticate a dashboard session.

**Decision 9.2 — the permission is the atomic unit; the role is a bundle.** Authorisation
for internal users is expressed in permissions, never in role names. Code asks whether the
actor holds `vehicle.declare`; it never asks whether the actor is a Vehicle-Record Officer.
Roles exist to make permissions administrable, not to make authorisation decisions.

Permissions are named `resource.action` — for example `vehicle.declare`,
`vehicle.suspend`, `member.approve`, `card.issue`, `sticker.issue`, `api_client.approve`,
`audit.export`. The catalogue is a seeded table, not a TypeScript enumeration, so that a
permission may be introduced without a schema migration.

**Decision 9.3 — roles carry predefined permissions; individual permissions are toggleable
per user.** The model has three layers, evaluated in this order:

1. **Role grants.** The eleven roles of PRD §16 are seeded as system roles, each with a
   predefined permission set. A user may hold more than one role; role permissions union.
2. **Per-user grants.** An individual permission may be switched on for a user who does not
   hold it by role, without inventing a bespoke role for that person.
3. **Per-user revocations.** An individual permission may be switched off for a user who
   does hold it by role.

Effective permissions = (union of role permissions) + explicit grants − explicit
revocations. **Revocation always wins.** Where a permission is both granted and revoked for
the same user, it is withheld. Ambiguity in an access-control system must resolve towards
denial.

**Decision 9.4 — every permission assignment carries an organisational scope.** A branch
administrator holds their permissions *within their branch*. A scope is a node of the
hierarchy of PRD §6, or the root for Union-wide authority. A guard evaluating
`vehicle.declare` establishes both that the actor holds the permission and that the subject
record falls within the actor's scope for it. Without this, the eleven roles collapse into
a single privilege level the moment a second branch exists.

**Decision 9.5 — system roles are immutable; custom roles are permitted.** The eleven
seeded roles cannot be edited or deleted, so that a misconfiguration cannot silently
broaden a role the Union believes it understands. A super administrator may compose
additional roles from the permission catalogue.

**Decision 9.6 — permission changes are audited as first-class events.** Granting,
revoking, assigning a role, and altering a scope each emit an audit event recording actor,
subject, permission, before-and-after state, and stated reason. Privilege escalation must
be as legible in the audit trail as record modification.

**Decision 9.7 — `vehicle.declare` is held by the super administrator alone, and by those
to whom the super administrator expressly grants it.** Determined 9 September 2026,
superseding the earlier determination of the same date.

`vehicle.declare` **belongs to no system role bundle** other than super administrator. It
is absent from the vehicle-record officer, from branch and unit administrators, and from
every other seeded role. An operator obtains it only through an explicit per-user grant
under Decision 9.3, issued by a super administrator and scoped under Decision 9.4.

This makes the per-user grant layer load-bearing for declaration work, which is the
intended effect: the Union can see precisely who may create a declaration, because the
answer is an enumerable list of named grants rather than an inference from role
membership.

**Decision 9.7.1 — the permission must be enumerable.** The administration interface must
answer "who may currently declare a vehicle, and within what scope" as a direct query. A
permission this sensitive is worthless as a control if establishing who holds it requires
reasoning across role bundles, grants, and revocations by hand.

**Decision 9.7.2 — grants are revocable and audited on both edges.** Issuing and
withdrawing `vehicle.declare` each emit an audit event naming the granting administrator,
the recipient, the scope, and the stated reason (Decision 9.6).

**Decision 9.7.3 — step-up re-authentication remains built but disabled.** The capability
to demand a fresh second factor at the point of exercise exists per permission and is not
presently enabled for `vehicle.declare`.

The residual exposure — that a hijacked session creates declarations — is materially
smaller under this determination than under the earlier one, because the holder set is now
a deliberately maintained list rather than three role classes. It is further bounded by
organisational scope (Decision 9.4), by complete audit capture (Decision 7.1), and by the
absence of any route to create a declaration other than this permission (PRD §9.5).
Enabling step-up later is a configuration change, not a code change.

**Decision 9.8.** External clients are authorised by scope, not by permission or role. The
two systems are deliberately separate and share no table: an internal permission can never
be reached through an API token, and a scope can never be reached through a session.

**Decision 9.9.** All authorisation is evaluated by guards before a controller executes. No
authorisation decision is taken inside business logic, where it cannot be enumerated,
tested exhaustively, or audited.

**Decision 9.3.** Multi-factor authentication is required for the privileged roles
identified in PRD §17.1. The mechanism is pluggable; the initial implementation is
time-based one-time passwords.

**Decision 9.4.** Tokens are stored as hashes only. The plaintext value exists solely in
the response to the creating or rotating request. Revocation is a database state change
and takes effect immediately, satisfying acceptance criterion 11.

---

## 10. Data protection

**Decision 10.1.** Sensitive registration data — next of kin, guarantor, collateral,
telephone, residential address, signature — is held in tables distinct from card-display
data, with access mediated by the `member-profile` module. The separation is structural,
not merely a matter of query discipline.

**Decision 10.2.** Uploaded passport photographs and signatures are held in object storage,
never in the repository and never in the database. Access is by time-limited signed URL.

**Decision 10.3.** Chassis and VIN values are stored in a restricted column, excluded from
every disclosure profile, and excluded from default query selections.

**Decision 10.4 — data residency: European Union region.** Determined 9 September 2026.
Production data is held in a London or Frankfurt region.

The records are the personal data of Nigerian union members, and their storage outside
Nigeria is a cross-border transfer under the Nigeria Data Protection Act 2023. Neither
DigitalOcean nor Neon offers an African region, so in-country residency was not available
without abandoning the agreed stack. Of the available regions, the EU offers the lowest
latency to West Africa and the most straightforward transfer position.

**Decision 10.4.1.** The Union should be advised to record the lawful basis for this
transfer in its own data-protection documentation before go-live. This is a governance
action for the Union, not an engineering task, and is tracked as such in item 15.

**Decision 10.4.2.** The region is environment configuration. Should a Nigerian region
later become available from either provider, or should the Union elect to self-host,
relocation is a provisioning exercise: no domain code depends on the region, per
Decision 12.1.

---

## 11. API versioning

**Decision 11.1.** All external routes are prefixed `/api/v1`. Version 1 is never broken
once an external client has been issued credentials against it. Breaking changes are
introduced as `/api/v2`, with both versions served concurrently during a transition period
determined by the Union.

**Decision 11.2.** Additive changes to a response are permissible within a version only
where the added field is admitted by an explicit disclosure profile, per Decision 5.1.

---

## 12. Provision for future extension

The following are deliberate accommodations for anticipated growth. They are inexpensive
now and costly to retrofit.

| Provision | Enables |
|---|---|
| Modular monolith with enforced boundaries (4.1) | Extraction of high-volume modules into separate services |
| Disclosure profiles as data (5.2) | New external organisation classes without release |
| Configurable identifier strategies (6.3) | Union-determined number formats; format revision |
| `template_version` on cards and stickers (PRD §8, §10) | Redesign without invalidating issued artifacts |
| Shared rate-limit state (8.2) | Horizontal scaling of the API |
| Pluggable multi-factor mechanism (9.3) | Hardware tokens or an alternative second factor |
| Versioned API from the first release (11.1) | Non-breaking evolution of the external contract |
| Framework-independent domain package (3.2) | Framework replacement without loss of domain rules |
| Cloud-agnostic container and env-driven configuration | Relocation of hosting without domain change |

**Decision 12.1.** Domain code must not call a DigitalOcean, Vercel, or Neon API directly.
Platform interaction is confined to configuration, infrastructure definitions, and
deployment scripts.

---

## 13. Testing

**Decision 13.1.** The following require test coverage before the item that introduces them
is considered complete: disclosure projection against every profile; plate normalisation
including malformed input; status-transition validity for cards, stickers, and
declarations; scope enforcement per endpoint; rate-limit and enumeration detection; and
audit emission for every mutating route.

**Decision 13.2.** Test fixtures are synthetic. No row from `data/` is reproduced in a
test, per PRD §25.2.

---

## 14. Printing

Determined at item 06, which is the first item that produces a physical artifact.

**Decision 14.1 — rendering is `pdf-lib`, and no browser enters the container.**
Cards, stickers, and the wet-signature form are drawn with `pdf-lib`: pure
JavaScript, no native dependency, no headless browser, no system fonts. The
alternative considered and rejected was HTML rendered by headless Chromium, which
adds roughly 300 MB and a full browser to a container that otherwise runs a Node
process — a remote-code-execution surface being handed member photographs, to be
patched on the Union's schedule rather than a browser vendor's. It also makes
layout depend on a font stack resolved inside the image, so the same HTML renders
differently after a base-image bump, which is precisely what `template_version`
exists to prevent.

A card is a fixed-size artifact — ISO/IEC 7810 ID-1, 85.60 × 53.98 mm — with about
a dozen elements at fixed positions. That is a coordinate problem, not a layout
problem.

The accepted cost: `pdf-lib` draws text but does not lay it out, so wrapping and
fitting are hand-written. That is one small module,
`apps/api/src/pdf/text.ts`, written once and shared by every document.

**Decision 14.2 — a template is a versioned module, not a database row.** The
`template_version` column promises that a redesign does not invalidate cards
already issued (§12). That promise holds only if the *old renderer still exists*,
so each template is a module registered under its version and a card renders
through the version it records. Removing a template module is a breaking change;
`registry.spec.ts` names every version ever issued against so that removing one
fails a test rather than a member at a counter.

This is deliberately not Decision 5.2's "profiles are rows, not code". A
disclosure profile changes when the Union onboards an organisation and must not
require a deploy. A card redesign is a print-shop event with weeks of lead time
that needs the artwork committed and reviewed. Opposite change profiles, opposite
mechanisms.

**Decision 14.3 — an unissued artifact is visibly unissued.** A card that has not
reached `ISSUED` renders with no card number and a diagonal `PROOF — NOT ISSUED`
overprint. Without it, the approval step is decorative: an officer could print
the draft, laminate it, and hand it over. The same treatment applies to stickers
at item 08.

**Decision 14.4 — fonts are the standard fourteen, until the artwork arrives.**
Layout is deterministic because `pdf-lib` computes positions from built-in
metrics, but glyph rasterisation is the viewer's. Embedding a licensed typeface
is deferred to the version cut against the Union's official artwork
(QUESTIONS.md **CARD-05**), which is when the typefaces are specified anyway.
Recorded so it is a decision rather than an oversight.

---

## 15. Matters not yet decided

All business and policy questions were determined on 9 September 2026 and are recorded at
PRD §23. What remains are engineering choices, to be made at the item that first requires
them.

| Matter | Determined at |
|---|---|
| Redis provider and topology | Item 13 |
| Object storage provider for photographs and signatures | Item 05 |
| Package manager and monorepo tooling | Item 01 |
| Whether the officer portal is a route within the dashboard or a separate deployment | Item 10 |
| Secret-management mechanism for the QR signing key, including rotation procedure | Item 08 |

---

## 16. Determinations affecting this document

The following were settled on 9 September 2026 and are reflected in the decisions above.
They are listed here so that a reader need not diff the document to find what changed.

| Matter | Determination | Decision |
|---|---|---|
| Organisational hierarchy | Council → Zone → Branch → Unit → Member | PRD §6 |
| Unit and Unity Body | One entity | PRD §23.3 |
| Identifier scheme | Opaque, memorable, HMAC-signed QR | 6.2 |
| Legacy barcodes | Resolve as fully equivalent; risk recorded | 6.4 |
| Roles and permissions | Permission-atomic, role bundles, per-user toggles, scoped | 9.2–9.9 |
| `vehicle.declare` | Super administrator only, plus express per-user grants. In no other role bundle. No step-up. | 9.7 |
| Aggregate access | Two tiers; unfiltered total tier immune to differencing | PRD §13.2 |
| Suppression threshold | Below 25 | PRD §13.3 |
| Token expiry | 90 days | PRD §12.6 |
| Data residency | EU region | 10.4 |
| Retention | Members ongoing · audit 7 years · API logs 12 months | PRD §23.15 |

The following were added by revision 1.2, 22 September 2026:

| Matter | Determination | Decision |
|---|---|---|
| Legacy barcodes | Resolve only once reattached under Requirement 9A.4's four conditions; the register is closed | 6.4, 6.5 |
| On record / onboarded / declared | Three structurally separate facts: a new `ON_RECORD` declaration state, onboarded derived from an attached sticker, never a flag on the declaration row | 6.5 |
| Payments | Fee types as data, Paystack subaccount split, webhook plus server verification, settlement account editable in settings with no second approver | PRD §27 |
