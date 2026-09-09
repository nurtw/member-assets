# Product Requirements Document

## NURTW Membership and Vehicle Verification System

**Owner:** National Union of Road Transport Workers — Anambra State Council
**Status:** Approved for implementation — all determinations recorded at §23
**Document version:** 1.1
**Last revised:** 9 September 2026

---

## 0. Purpose and standing of this document

This document is the authoritative requirements specification for the NURTW Membership
and Vehicle Verification System. It is derived from two source documents supplied by the
Union, which remain the record of original intent:

| Source | Location |
|---|---|
| Development and implementation proposal | `docs/Proposal_for_the_Development_and_Implementation_of.md` |
| Membership / registration / guarantorship form specification | `docs/National_Union_of_Road_Transport_Workers_(NURTW).md` |

Section numbering in this document is aligned with the proposal so that cross-references
remain stable. Where this document and an implementation plan disagree, this document
prevails; the discrepancy is to be recorded in `HANDOFF.md` and referred to the Union for
determination rather than resolved unilaterally.

---

## 1. Executive summary

The System is a Union-owned platform for the administration of members, registered
transport units, declared vehicles, membership cards, vehicle stickers, and controlled
verification services.

It establishes a dependable relationship between a member of the Union, that member's
organisational assignment, and any vehicle declared under that member or transport unit.
It supports verification by vehicle plate number, sticker QR code identifier, membership
number, and such further identifiers as the Union may approve.

The Union retains control of master data, user accounts, organisational structure,
verification rules, card and sticker issuance, access permissions, and audit records.
External organisations may query selected endpoints only after the Union has approved
them, issued API credentials, and assigned explicit permissions.

## 2. Scope

### 2.1 In scope

- Member registration, review, and approval.
- Organisational hierarchy: council, zone, branch, and unit.
- Vehicle declaration and association with a member or transport unit.
- Membership card design, issuance, replacement, and status management.
- Vehicle sticker inventory, QR identifier generation, issuance, and replacement.
- Plate-number and sticker-QR verification across four channels.
- Controlled API access for approved external organisations.
- Aggregate reporting, including declared-vehicle totals.
- Audit trails, access monitoring, and abuse prevention.

### 2.2 Out of scope — determined and confirmed

The following are excluded by the proposal and are confirmed as excluded for this
engagement. They are recorded here because the legacy data export contains records of
each, and their exclusion is a deliberate decision rather than an oversight.

| Excluded | Rationale |
|---|---|
| Revenue and levy collection | Proposal §2: the platform is expressly not a revenue-collection platform. `vehicle_wallets`, `vehicle_transactions`, and `company_charges` are therefore not migrated. |
| Vehicle-registration authority functions | The System records declarations; it does not register vehicles. |
| Public searchable directory | Verification is permitted; browsing is not. |
| Statutory or legal certification | The System asserts only the existence of a Union record. |

### 2.3 Scope changes

Any addition to §2.1 — in particular any reintroduction of billing — requires a revision
of this document approved by the Union, not a plan-level decision.

---

## 3. Problems to be addressed

The Union's paper-based membership cards, registration forms, vehicle records, and
stickers are difficult to search, update, verify, and audit. The System is required to
address the following operational problems:

1. Difficulty in confirming whether a person is an active member.
2. Difficulty in identifying the Union record associated with a plate number.
3. Counterfeit or duplicated membership cards and stickers.
4. Lost or replaced cards and stickers without a clear history.
5. Inconsistent branch, unit, designation, and vehicle records.
6. Uncontrolled sharing of member and vehicle information.
7. Absence of a dependable means for approved external organisations to verify limited facts.
8. Excessive load or abuse arising from repeated queries against verification services.
9. Absence of a consistent distinction between a declared vehicle, an active sticker, and
   a verified current record.

These are to be addressed without converting the Union's internal records into a public
directory.

---

## 4. Operating principles

These principles are binding on the implementation. They are restated in `CLAUDE.md` in
operational form.

1. **The Union owns the record.** External parties consume approved services; they do not
   control source data.
2. **Declare first, verify second.** A vehicle must hold a declaration or sticker record
   before the System may return a positive result.
3. **Minimum necessary disclosure.** A response contains only the fields required for the
   requesting organisation's approved purpose.
4. **Permission before access.** Every external credential carries an organisation, an
   owner, scopes, an expiry policy, and an audit trail.
5. **No implied legal conclusion.** A positive result indicates only that a matching
   record exists under the stated criteria.
6. **Every sensitive action is auditable.**
7. **Verification must remain available but protected.** Rate limiting, quotas, caching,
   and abuse detection are requirements, not optimisations.
8. **History is preserved.** Records are superseded, never silently overwritten.

---

## 5. Terminology

The controlled vocabulary is defined in the proposal at §5 and is adopted here without
amendment. Implementations must use these terms in code, interface copy, and
documentation. Of particular note:

- **Declared vehicle** — a vehicle recorded in the System. Declaration does not establish
  legal ownership.
- **Unit / Unity Body** — the local organisational unit shown on the registration form and
  card. Determined at §23.3 to be a single entity: *Unit* in code and administration,
  *Unity Body* on the printed form and card. It sits beneath a Branch.
- **Sticker QR code ID** — a unique opaque identifier. It contains no personal data.
- **Verification** — a response indicating whether a submitted identifier matches a Union
  record under the requested rule.

---

## 6. Organisational hierarchy

Determined at §23.1. The hierarchy has four levels beneath the council:

```
NURTW
  |- Council                      (e.g. Anambra State Council)
  |    |- Zone
  |    |    |- Branch
  |    |    |    |- Unit / Unity Body
  |    |    |    \- Members
  |    \- Authorised officers
  |- Membership records
  |- Vehicle declarations
  |- Membership cards
  |- Vehicle stickers
  \- External API clients
```

**Requirement 6.1.** Every level is present in the model. Where the Union does not
presently operate a level, a single default node is seeded rather than the level being
omitted, so that the structure remains uniform and an administrator's scope remains
expressible at any depth.

**Requirement 6.2.** Every permission assignment is scoped to a node of this hierarchy, or
to the root for Union-wide authority. See `ARCHITECTURE.md` Decision 9.4.

The terms *state*, *council*, *zone*, *branch*, and *unit* are Union organisational
attributes. They must not be presented in any interface as evidence that the platform is
owned or administered by an external authority.

---

## 7. Membership registration

The registration module digitises the Union's membership, registration, and guarantorship
form. The complete field specification, including recommended controls and validation, is
set out in `docs/National_Union_of_Road_Transport_Workers_(NURTW).md` and is incorporated
here by reference.

Four data groups are captured: **applicant**, **organisational assignment**, **next of
kin**, and **guarantor**, together with a **review and approval** record.

**Requirement 7.1.** Sensitive registration data — next-of-kin details, guarantor details,
signatures, collateral responses, telephone numbers, and residential addresses — must be
stored separately from card-display data and must not be reachable through any
verification path.

**Requirement 7.2.** Where the state and the local government area are both captured as
structured values, the System must validate that the local government area belongs to the
selected state.

---

## 8. Membership card

Card fields, their system treatment, and the issuance record are specified in the proposal
at §8 and adopted here.

**Card statuses:** Draft, Pending Approval, Issued, Active, Suspended, Lost, Replaced,
Expired, Cancelled.

**Requirement 8.1.** A card issuance record must retain the card number, template version,
status, issue date, renewal date where applicable, issuing user, approving officer,
replacement relationship, and audit events.

**Requirement 8.2.** The card's **State** field is an organisational attribute and must
remain distinct from the member's **state of origin**.

---

## 9. Vehicle declaration

Vehicle fields and declaration rules are specified in the proposal at §9 and adopted here.

**Declaration statuses:** Pending, Active, Suspended, Retired, Disputed, Archived.

**Requirement 9.1.** Plate numbers are stored in both a normalised form
(`plate_number_normalized`) and a display form (`plate_number_display`). All lookup,
matching, and uniqueness constraints operate exclusively on the normalised form.

**Requirement 9.2.** The System must prevent duplicate active declarations for the same
normalised plate number unless the Union has expressly permitted multiple records bearing
a conflict status.

**Requirement 9.3.** A plate-number match must not automatically disclose the member
record. The System determines the requester's permission scope first and returns the
smallest permitted response.

**Requirement 9.4.** Chassis and VIN data, where captured, is restricted and is never
exposed through an external API by default.

**Requirement 9.5 — declaration is a manual, permissioned act.** A vehicle declaration is
created only by a user holding the `vehicle.declare` permission — which belongs to the
super administrator alone, and to those the super administrator expressly grants it to,
per `ARCHITECTURE.md` Decision 9.7 — acting deliberately
through the declaration interface. No other route may create a declaration. In particular:

- A verification enquiry must never create, complete, or reactivate a declaration, whether
  the identifier is matched or unmatched. Verification is a read-only path without
  exception.
- A successful verification against an external identifier, a scan, or any third-party
  source does not entitle a vehicle to a declaration record.
- The legacy migration (item 09) creates declarations under an identified system actor and
  is the sole exception. Every record it creates is marked with its provenance and is
  distinguishable in the audit trail from an operator declaration.

**Requirement 9.6.** Verification endpoints and services must hold no write capability to
declaration, sticker, card, or member tables. This is to be enforced structurally — by the
module boundary and by the database role the verification path executes under — and not by
convention alone.

---

## 10. Vehicle sticker

Sticker fields, statuses, and the permitted QR verification result are specified in the
proposal at §10 and adopted here.

**Sticker statuses:** Draft, Issued, Active, Suspended, Lost, Replaced, Damaged, Expired,
Cancelled.

**Requirement 10.1.** The QR code encodes an opaque identifier or a signed verification
reference. It must not encode a member's name, telephone number, address, guarantor
details, or vehicle chassis number.

**Requirement 10.2.** Sticker QR identifiers must be non-sequential and must not be
derivable from the plate number, the member record, or the issuance order.

---

## 11. Verification channels

| # | Channel | Disclosure level |
|---|---|---|
| 1 | Internal dashboard | Full access according to the staff user's role |
| 2 | Officer verification portal | Rapid plate and QR checks for authorised officers |
| 3 | Controlled external API | Machine-to-machine, scoped tokens |
| 4 | Optional public verification page | Highly limited; subject to §23 confirmation |
| 5 | Internal issuance interface | Authorised operators and approvers |

**Requirement 11.1.** A successful verification must be expressed as: *"A matching NURTW
vehicle/sticker record was found under the requested verification criteria."* Interface
and API copy must not assert certification of legal ownership, roadworthiness, licensing,
or any external statutory status.

---

## 12. External API

The API client registration requirements, the scope catalogue, the endpoint list, and
worked request and response examples are specified in the proposal at §12 and adopted here
without amendment.

**Requirement 12.1.** API tokens are stored as hashes. Secret values are displayed once,
at creation or rotation only.

**Requirement 12.2.** Tokens must never appear in URLs, browser-delivered code, QR
payloads, logs, or error messages.

**Requirement 12.3.** Verification requests use request bodies. Sensitive or trackable
identifiers must not be placed in query strings.

**Requirement 12.4.** Broad scopes such as `database:read` or `member:read:all` must not
be defined, and must not be grantable to an external organisation.

**Requirement 12.5.** The scope catalogue of proposal §12.2 is adopted, amended by the
substitution of two aggregate scopes for the single `aggregate:vehicles:read` originally
proposed. See §13.2.

**Requirement 12.6.** External API tokens expire after **90 days**. Advance rotation
reminders are issued to the client's registered technical contact. Determined at §23.12.

---

## 13. Aggregate reporting

Specified in the proposal at §13 and adopted here.

**Requirement 13.1.** Filters are restricted to the predefined dimensions listed at §13.2
of the proposal. Arbitrary filters, free-form field selection, and pagination over
underlying vehicle records are prohibited.

**Requirement 13.2.** Aggregate access is granted at **two distinct tiers**, determined
9 September 2026. The tiers are separate scopes and a client may hold either or both.

| Tier | Scope | Behaviour |
|---|---|---|
| Grand total | `aggregate:vehicles:total` | Returns the unfiltered total only. Any filter parameter is rejected as a request error, not silently ignored. |
| Filtered | `aggregate:vehicles:read` | Accepts the approved filter dimensions, subject to suppression per Requirement 13.3. |

The grand-total tier exists because an unfiltered count cannot be differenced: there is no
second query to subtract from it. It is therefore the appropriate grant for a client
requiring only a headline figure, and carries no disclosure risk.

**Requirement 13.3.** Under the filtered tier, a total below **25** is suppressed and a
suppression indicator returned in place of the count. The threshold is Union-configurable
at runtime.

**Requirement 13.4.** Suppression must be applied to the computed result, never by
declining to run the query. A caller must not be able to distinguish a suppressed total
from an unavailable one by response timing or error class.

---

## 14. Rate limiting and abuse prevention

Specified in the proposal at §14 and adopted here.

**Requirement 14.1.** The limit profile at §14.2 of the proposal is an initial testing
configuration, not final policy. All limits, quotas, and thresholds must be adjustable by
a Union administrator at runtime, without a code deployment.

**Requirement 14.2.** The System must detect and respond to sequential plate enumeration
and QR brute-force patterns, independently of whether the client remains within its
overall quota.

**Requirement 14.3.** Not-found responses must be generic and must not indicate that a
submitted identifier was close to a valid value.

---

## 15. Disclosure profiles

The five profiles — Minimal verification, Operational verification, Membership
verification, Aggregate reporting, and Internal — are specified in the proposal at §15 and
adopted here.

**Requirement 15.1.** Disclosure profiles must be stored as configuration data. Defining a
new profile or amending an existing one must not require a code deployment.

**Requirement 15.2.** Responses must be constructed by projecting a record through the
caller's profile. Retrieving a complete record and subsequently removing fields is not an
acceptable implementation, as it fails unsafely when the schema is extended.

---

## 16. Roles and permissions

The eleven internal roles and the treatment of external organisations are specified in the
proposal at §16 and adopted here.

**Requirement 16.1.** No external organisation may receive administrator privileges,
record-editing privileges, issuance privileges, or unrestricted database access.

---

## 17–18. Security, privacy, and audit

Specified in the proposal at §17 and §18 and adopted here in full.

**Requirement 17.1.** Multi-factor authentication is required for privileged roles.

**Requirement 17.2.** Application logs must not contain full API tokens, passport images,
signatures, guarantor details, or unnecessary personal data.

**Requirement 18.1.** Audit events must record before-and-after status values for material
changes, and the stated reason for any manual override, correction, replacement, or
suspension.

**Requirement 18.2.** Historical records are corrected by versioned change or correction
event, never by silent overwrite.

---

## 19. System modules

The fifteen modules listed in the proposal at §19 are adopted as the module boundary for
implementation. Each is realised as a discrete NestJS module. See `ARCHITECTURE.md`.

---

## 20. Delivery phases

| Phase | Content | Roadmap items |
|---|---|---|
| Foundation | Repository, schema, authentication and access control | 01–03 |
| One | Organisational hierarchy, registration, approval, member status | 04–05 |
| Two | Cards, vehicle declarations, sticker inventory and issuance | 06–08 |
| Interlude | Legacy data migration | 09 |
| Three | Internal verification | 10 |
| Four | Controlled external API, rate limiting, aggregate reporting | 11–14 |
| Five | Operational hardening and go-live | 15 |

The foundation phase and the migration interlude are additions to the proposal's five
phases. They are implementation necessities rather than scope extensions.

---

## 21. Acceptance criteria

The System is accepted when the following hold. Each is testable.

1. A membership application may be captured, reviewed, approved or rejected, and the full
   decision history is retrievable.
2. An approved member may be issued a membership card bearing a unique card number, and a
   replacement card preserves its relationship to the card it supersedes.
3. A vehicle may be declared, and a second active declaration bearing the same normalised
   plate number is refused.
4. A sticker may be issued against a declared vehicle, and its QR identifier is opaque and
   non-sequential.
5. An authorised officer may verify by plate, by QR, and by both together, with a mismatch
   between plate and QR correctly reported.
6. An external client holding only `vehicle:verify:plate` receives a response containing no
   field outside the Minimal verification profile.
7. A client exceeding its configured rate limit receives `429` with a `Retry-After` value.
8. Sequential plate enumeration is detected and blocked while the client remains within its
   nominal quota.
9. An aggregate query returns totals only, and a filtered total below the configured
   threshold returns a suppression indicator.
10. Every create, update, approve, issue, suspend, replace, export, and override action
    appears in the audit trail with actor, timestamp, and before-and-after values.
11. Revoking a token takes effect without a redeployment.
12. No verification response, at any disclosure level, contains a telephone number,
    residential address, next-of-kin detail, guarantor detail, chassis or VIN value,
    signature, or internal note.

---

## 22. Limitations

A Union record does not certify legal ownership of a vehicle, the validity of an external
registration document, roadworthiness, driver licensing, insurance status, chassis or VIN
ownership, criminal-record status, a person's legal identity beyond information the Union
has collected and approved, or authorisation to operate in any location outside the
Union's own rules.

Verification responses must state the exact matter verified and include a timestamp or
data-as-of value.

---

## 23. Determinations

The proposal at §23 posed sixteen questions requiring decision before implementation.
These were put to the project owner and determined on **9 September 2026**. Two further
matters, arising from the legacy export rather than the proposal, were determined at the
same time.

Each determination below is binding. Where an implementation plan appears to require a
different answer, the discrepancy is to be recorded in `HANDOFF.md` and referred back
rather than resolved in the plan.

### 23.1 Organisational hierarchy

**Council → Zone → Branch → Unit → Member.** Four levels beneath the council. Where the
Union does not presently use a level, a single default node is seeded so that the
structure remains uniform and scope-limited administrators remain expressible.

### 23.2 The card's *State* field

Denotes **the issuing council's state**, which is `ANAMBRA` for this deployment. It is
stored as a field rather than a constant so that further state councils may be onboarded
without schema change. It remains distinct from `member.state_of_origin`.

### 23.3 Unit and Unity Body

**One entity.** A single table. Code and administrative interfaces use *Unit*; the printed
form and membership card display *Unity Body*.

### 23.4 Master data

Held in an administrable table, **seeded from the legacy export** and thereafter corrected
and extended by the Union through the interface. Designations, branches, units, vehicle
categories, and statuses are therefore data, not code, and item 04 is not gated on the
Union supplying lists in advance.

### 23.5 Expiry and renewal

**Configurable validity per template.** Each card and sticker template carries a validity
period, which may be *none*. The Union may introduce renewal later without a migration.

### 23.6 Number formats

**Opaque but memorable, with an authenticity signature.** See §26 for the full
specification. Human-readable identifiers use a grouped, unambiguous alphabet suitable for
dictation; QR payloads additionally carry a cryptographic signature.

### 23.7 Officer signatures

**Stored signature assets, composited at print.** Approved signature images are held
against the officer record. Uploading or replacing a signature asset is a sensitive
permission subject to audit.

### 23.8 Multiple vehicles per member

**Permitted, without limit.** The legacy data confirms operators commonly run several
vehicles.

### 23.9 Vehicle-to-member conflicts

**One active declaration per normalised plate.** A competing declaration is refused and
recorded as **Disputed** for administrative resolution. Both claims and the full history
are preserved; neither is discarded.

### 23.10 Eligible external organisations

All four classes are eligible, subject to individual approval: law enforcement and road
agencies; insurance companies; financial institutions and asset financiers; and other
NURTW councils and state chapters.

### 23.11 Disclosure-profile assignment

**Assigned per organisation at the point of approval**, and amendable thereafter without a
deployment. Profiles are not fixed by organisation class.

### 23.12 Limits, quotas, thresholds, and token expiry

- **Rate limits:** the profile at proposal §14.2 is adopted as launch configuration,
  adjustable at runtime.
- **Token expiry:** 90 days, with advance rotation reminders to the technical contact.
- **Suppression threshold:** aggregate totals below **25** are suppressed. See §13.

### 23.13 Public verification page

**Provided, by QR scan only.** Scanning a physical sticker opens a result page. There is
no form to type into and no query parameter that can be enumerated; possession of the
physical sticker is a precondition of any result.

### 23.14 Permitted verification response fields

Beyond the match result itself, the following may be disclosed subject to the caller's
profile: **vehicle category**, **sticker status**, **branch or unit label**, and **issue or
validity date**.

### 23.15 Retention

- **Member records:** retained for the duration of the membership relationship.
- **Audit events:** 7 years.
- **API request logs:** 12 months.

Retention periods are configuration, and purging is performed by an administrative process
outside the application write path.

### 23.16 Digital signatures and photographs

**Hybrid.** Signatures and passport photographs are captured digitally, and the System also
produces a print-ready form for wet signature where the Union's process requires it. This
permits a later move to fully digital records without rebuilding.

### 23.17 Completeness of the legacy export *(additional)*

**Confirmed complete.** Determined by the owner that the export represents the whole of the
Union's existing electronic vehicle register. The distribution of vehicle categories,
including 7 tricycles among 2,841 vehicles, reflects what the previous system actually
held and is not evidence of a partial extract.

Tricycles and any further vehicle classes are registered through the System from go-live
onwards. The migration therefore establishes an opening position rather than a complete
picture of the Union's fleet, and growth in the tricycle category after launch is expected
behaviour, not a data defect.

**Requirement 23.17.1.** The migration's reconciliation report states the imported category
distribution as an opening baseline. It must not present the tricycle count as an anomaly
requiring investigation.

### 23.18 Vehicles lacking a local government area *(additional)*

**Imported with the field blank and flagged for operational cleanup.** All 2,841 vehicles
migrate. The approximately 1,908 records lacking an LGA are marked incomplete and appear in
a staff worklist. **The migration must not infer an LGA** from address text: an inferred
value would be indistinguishable from a recorded one.

---

## 24. Canonical field names

The field-name catalogue in the proposal at §24 is adopted verbatim as the System's shared
vocabulary. Implementations must not introduce parallel names for the same concept.

---

## 25. Legacy data

A production export of the Union's existing system is held in `data/`, outside version
control. Its contents, volumes, enumerations, and known quality defects are catalogued in
`CLAUDE.md`.

**Requirement 25.1.** Members, vehicles, drivers, and sticker requests are migrated.
Wallets, transactions, and company charges are not, per §2.2.

**Requirement 25.2.** The export contains member personal data and password hashes. It
must not enter version control, nor be reproduced in documentation, plans, commit
messages, or test fixtures.

**Requirement 25.3.** Approximately 67 per cent of vehicle records carry no local
government area. The migration must record this deficiency explicitly rather than infer a
value.

---

## 26. Identifier and anti-forgery specification

Determined 9 September 2026, pursuant to §23.6.

### 26.1 Human-readable identifier

Membership numbers, card numbers, and sticker identifiers are opaque and non-sequential,
rendered in a grouped, unambiguous alphabet excluding characters liable to be confused in
handwriting or speech. They convey no branch, no sequence, and no issuance date, so that a
member transferring between branches retains their identifier and no observer may infer the
size of the register.

### 26.2 QR payload and signature

A sticker QR encodes the identifier together with a truncated HMAC over that identifier,
computed with a server-held secret. The payload carries a key identifier so that the secret
may be rotated without invalidating stickers already issued.

**Requirement 26.1.** A verifier must reject a payload whose signature does not validate
**before** any database access occurs. An invalid signature is not a database miss; it is a
forgery attempt and is recorded as such.

**Requirement 26.2.** The signing secret is held only by the issuing and verification
services. It is never present in the web application, in a QR payload, in client-delivered
code, or in any log.

### 26.3 What signing does and does not achieve

This distinction must be understood by anyone working on this area, and must be reflected
in how the Union describes the System.

| Attack | Mitigated by |
|---|---|
| Fabricating a new, never-issued sticker code | **Signature.** The secret is required to mint a valid payload. |
| Copying a genuine sticker onto another vehicle | **Not the signature.** A copied payload is a valid payload. Defeated by plate-to-QR binding and combined verification (§12.3), and by a destructible physical substrate. |
| Continuing to use a sticker reported lost or cancelled | **Status lifecycle.** Verification consults sticker status; a signature alone is never sufficient for a positive result. |

**Requirement 26.3.** A valid signature is necessary but never sufficient. Every positive
verification additionally requires an active record of good status.

**Requirement 26.4 — satisfied.** Stickers are produced on a destructible or tamper-evident
substrate, so that removal from one vehicle destroys the article. The owner confirmed on
9 September 2026 that this is already in place.

This control is load-bearing and must not be relaxed without a corresponding revision here.
No software control can prevent the physical transfer of an intact sticker; the substrate
is the only defence against a genuine, validly signed sticker being moved between vehicles,
and it operates alongside plate-to-QR binding rather than in place of it.

### 26.4 Legacy identifiers — determined, with recorded risk

**Determination (§23, additional).** The 2,408 barcodes already issued under the previous
system **resolve as fully equivalent** to signed identifiers. Nothing presently in the field
ceases to work, and officers encounter no difference in behaviour.

**Recorded risk.** The legacy barcode is a millisecond epoch timestamp. Issuance clusters
into seven months between July 2024 and September 2026, and the scheme is therefore
deducible from inspection of a single genuine sticker. It carries no authenticity proof and
cannot be distinguished from a fabricated value of the same shape.

The owner was advised of this and determined that continuity in the field outweighs the
residual risk. The determination stands. The following mitigations apply to legacy
identifiers notwithstanding, as they arise from controls required elsewhere:

1. Plate-to-QR binding and combined verification detect a legacy sticker presented against
   a vehicle other than the one it was issued for.
2. The sticker status lifecycle allows a legacy sticker reported lost or cancelled to be
   failed.
3. Verifications against legacy identifiers are distinguishable in the audit trail, so that
   the Union may quantify exposure and revisit this determination on evidence.

**Requirement 26.5.** Newly issued stickers use signed identifiers exclusively. The legacy
scheme is a read path for existing articles and must never be used to mint a new one.
