# Product Requirements Document

## NURTW Membership and Vehicle Verification System

**Owner:** National Union of Road Transport Workers — Anambra State Council
**Status:** Approved for implementation. All determinations are recorded at §23. Revision
1.2 (§2.3) is approved by the project owner (`QUESTIONS.md` PAY-09).
**Document version:** 1.2
**Last revised:** 22 September 2026

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
- Vehicle onboarding: reattaching legacy stickers and issuing new ones, gated on payment,
  and a printable vehicle letter (§9A). *Revision 1.2.*
- Collection of the onboarding fee, the yearly membership fee, the monthly levy, and further
  fee types, through Paystack (§27). *Revision 1.2.*
- Plate-number and sticker-QR verification across four channels.
- Controlled API access for approved external organisations.
- Aggregate reporting, including the external vehicle total (§13).
- Audit trails, access monitoring, and abuse prevention.

### 2.2 Out of scope — determined and confirmed

The following are excluded by the proposal and are confirmed as excluded for this
engagement. They are recorded here because the legacy data export contains records of
each, and their exclusion is a deliberate decision rather than an oversight.

| Excluded | Rationale |
|---|---|
| Legacy revenue records | Collecting payments is **in scope from revision 1.2** (§27), reversing proposal §2. The legacy `vehicle_wallets`, `vehicle_transactions`, and `company_charges` are still not migrated (`QUESTIONS.md` MIG-01). The System starts its own ledger at onboarding; whether legacy balances are honoured is PAY-04. |
| Vehicle-registration authority functions | The System records declarations; it does not register vehicles. |
| Public searchable directory | Verification is permitted; browsing is not. |
| Statutory or legal certification | The System asserts only the existence of a Union record. |

### 2.3 Scope changes

Any addition to §2.1 — in particular any reintroduction of billing — requires a revision
of this document approved by the Union, not a plan-level decision.

| Revision | Date | Change | Authority |
|---|---|---|---|
| 1.2 | 22 September 2026 | Paid onboarding, with legacy stickers unattached until reattached (§9A). Payments through Paystack (§27). An external vehicle total that counts only vehicles both onboarded and declared (§13). | Direction relayed by the project owner from NURTW (`QUESTIONS.md` VEH-13, PAY-01), approved by the project owner on 22 September 2026. No Union official is named (PAY-09). |

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
   before the System may return a positive result. A migrated legacy record is neither a
   declaration nor an attached sticker, so it never yields a positive result on its own
   (§9A).
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

- **Declared vehicle** — a vehicle a holder of `vehicle.declare` has marked declared
  (§9.5). Declaration does not establish legal ownership. *Revision 1.2 narrows this:* a
  vehicle that is merely recorded in the System is **on record**, not declared.
- **Onboarded vehicle** — a vehicle with a sticker attached following a confirmed payment
  (§9A). *Revision 1.2.*
- **Attached sticker** — a sticker bound to one vehicle by a recorded attachment event. A
  legacy sticker is imported **unattached**. *Revision 1.2.*
- **Fee type** — a kind of payment the System collects, defined as data (§27).
  *Revision 1.2.*
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
- The legacy migration (item 09) writes vehicle records under an identified system actor.
  Every record it creates is marked with its provenance and is distinguishable in the audit
  trail. *Revision 1.2:* those records are **on record only**. The migration creates no
  declaration and attaches no sticker (Requirement 9A.3).

**Requirement 9.6.** Verification endpoints and services must hold no write capability to
declaration, sticker, card, member, or payment tables. This is to be enforced structurally —
by the module boundary and by the database role the verification path executes under — and
not by convention alone.

---

## 9A. Vehicle onboarding *(revision 1.2)*

Determined 22 September 2026; see §23.19 and `QUESTIONS.md` VEH-13 to VEH-22.

**Requirement 9A.1 — three separate facts.** Whether a vehicle is **on record**,
**onboarded**, and **declared** are recorded independently, each with its actor and time.
None implies another. The external vehicle total counts only vehicles that are both
onboarded and declared (Requirement 13.5). Likewise, **the external API and the public page
return a positive verification only for a vehicle that is both** (`QUESTIONS.md` VEH-22).
The internal channels show every state.

**Requirement 9A.2 — onboarding.** A vehicle is onboarded when a sticker is attached to it
following a payment of the onboarding fee that Paystack has confirmed (§27). For a vehicle
carrying a legacy sticker, that means reattaching it. For one without, it means issuing a new
signed sticker. Both cost the same at launch (VEH-20) but are separate fee types. Onboarding
and declaration may happen in either order, and by different users. Attaching a sticker
requires `sticker.attach`, a permission field officers can hold. `vehicle.declare` keeps the
restrictions of Requirement 9.5 (VEH-18).

**Requirement 9A.3 — legacy records.** Migrated vehicles are on record only: neither
onboarded nor declared. Every legacy barcode is imported **unattached**, onto a register that
binds it to the normalised plate the export records for it.

**Requirement 9A.4 — reattachment controls.** Reattaching a legacy barcode is refused unless
**all** of the following hold. Each refusal is audited with its reason.

1. The barcode is on the imported Transpay register: the 2,408 in the export. **The register
   is closed.** Transpay has stopped issuing, and nothing is ever added to the register after
   the migration (VEH-21). Any other barcode is recorded as unknown rather than as a forgery,
   because NURTW holds a few printed Transpay stickers that have no digital record and that
   can therefore never be attached.
2. It is presented against the normalised plate the register records for it. **There is no
   override** (VEH-16).
3. It has never been attached before. A barcode attaches once in its life.
4. A Paystack-confirmed payment reference accompanies it, and that reference has not been
   used before.

**Requirement 9A.5 — the Transpay security code.** The export's `security_code` is imported
as a record only. It is not printed on the sticker (VEH-14), so it plays no part in
reattachment or verification.

**Requirement 9A.6 — the vehicle letter** (VEH-19). A printable, downloadable letter is
produced when a vehicle is onboarded, and is available from the vehicle's page thereafter.
It is rendered through a template carrying `template_version` (launch: `v1`), so that later
wording does not invalidate letters already issued.

- **Content.** The Union's name and emblem, a letter reference number, the date, the plate,
  the category, make, model and colour, the sticker number, the member's name and
  membership number, and the unit. The wording confirms that the vehicle is recorded with
  the Union, and carries the Requirement 11.1 statement that this is not evidence of
  ownership, roadworthiness, licensing, or insurance.
- **Signatories.** The State Chairman and the Secretary, from the card's signature assets.
  The lines stay blank until CARD-07 supplies them.
- **No QR code.** A QR carrying the sticker's payload on paper could be photocopied onto a
  counterfeit sticker, defeating the substrate control of §26.4.

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

**Requirement 10.3** *(revision 1.2)*. A sticker may exist unattached, and an unattached
sticker never yields a positive verification result. Attachment is a recorded event. A
sticker is attached to at most one vehicle in its life (§9A).

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

**Requirement 11.2** *(revision 1.2)*. On the internal channels, a legacy barcode that is on
the Transpay register but unattached reads *"Recognised Transpay sticker — not attached"*,
followed by the plate the register records for it (VEH-17). It does not say *genuine*: the
System can confirm that a barcode is on the register, not that the physical article is
authentic, because a copy scans identically. The recorded plate lets the officer catch a copy
on the wrong vehicle. The external API and the public page return the generic not-found,
because telling an outside party that a barcode is on the register would let it enumerate
the register.

**Requirement 11.3** *(revision 1.2)*. The internal channels show dues status beside the
result of a scan or search (§27, Requirement 27.8).

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

**Requirement 12.7** *(revision 1.2)*. No external response carries anything relating to
declaration: no declaration status, no field or record type naming it, and no filter on it.
This amends the example at proposal §12.5: the verification `record_type` becomes `NURTW_VEHICLE` rather
than `NURTW_DECLARED_VEHICLE`. No external response carries payment or dues status either
(Requirement 27.8).

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

**Requirement 13.5** *(revision 1.2)*. The external vehicle total, at both tiers, counts
only vehicles that are **both onboarded and declared**. Legacy records never count until they
are onboarded and declared. Per Requirement 12.7, this amends proposal §13:

- the endpoint is `GET /api/v1/aggregates/vehicles`, not `.../vehicles/declared`
- the count field is `vehicle_count`, not `declared_vehicle_count`
- `declaration_status` is removed from the filter dimensions

Internal reporting may break the three counts of Requirement 9A.1 out separately.

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

*Revision 1.2* adds a **payments** module (§27). It is the only module that talks to
Paystack, and it exposes payment confirmation to onboarding through an injected interface.
Onboarding itself belongs to the existing vehicle and sticker modules.

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

*Revision 1.2* adds payments, onboarding, and the vehicle letter (roadmap items 16–18),
which **are** a scope extension (§2.3). Onboarding must land before the external total
(item 14) can count anything.

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

*Added by revision 1.2:*

13. Reattachment is refused for a legacy barcode that is not on the register, is presented
    against a plate other than its recorded plate, has already been attached, or comes
    without an unused, Paystack-confirmed payment reference.
14. A migrated vehicle appears in no external total until it is both onboarded and declared.
15. No external response carries a declaration status, a payment status, or a dues status.
16. A payment is marked confirmed only after a webhook with a valid signature, followed by
    server-side verification of the transaction's amount and currency.
17. The total charged for any due matches the rule of Requirement 27.3, including the six
    worked figures at `QUESTIONS.md` PAY-10.
18. A new fee type can be created, priced, and charged without a deployment.

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
same time. §23.19 and §23.20 were added by revision 1.2 on **22 September 2026**.

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

### 23.19 Onboarding and legacy stickers *(revision 1.2)*

Determined 22 September 2026 (`QUESTIONS.md` VEH-13 to VEH-17).

- **Legacy vehicles are not declared.** They migrate on record only, and count toward
  nothing external until they are onboarded and declared.
- **Legacy stickers are unattached.** They are reattached through the System, after payment,
  subject to Requirement 9A.4.
- **Transpay has stopped issuing.** The register is closed at the export's 2,408 barcodes.
  The few printed Transpay stickers NURTW still holds have no digital record, so they are
  not on the register and cannot be attached (VEH-15, VEH-21).
- **A barcode presented against another plate is refused**, with no override.
- **No grace period** at go-live. Internally, an unattached registered barcode reads as
  recognised but not attached (Requirement 11.2).
- **An external match requires both onboarded and declared** (VEH-22). Onboarding and
  declaration may happen in either order; attaching needs `sticker.attach` (VEH-18).
- **The vehicle letter** is produced on onboarding and carries no QR code (VEH-19).

### 23.20 Payments *(revision 1.2)*

Determined 22 September 2026 (`QUESTIONS.md` PAY-01 to PAY-13).

- **Launch fee types:** the sticker fees (reattachment and new sticker), the yearly
  membership fee, and the monthly levy. Further types are added as data.
- **Settlement:** sticker fees go to the contractor's Paystack account. The membership fee
  and the levy settle to an NURTW subaccount. The NURTW bank account is entered, and can
  later be changed, from settings by the super administrator, with a password re-entry and
  a full audit trail but no second approver (Requirement 27.12).
- **The payer bears the cost.** On top of the due, the payer pays Paystack's fee and the
  contractor's fee of 0.5 per cent, capped at ₦200.
- **Launch amounts:** stickers ₦2,000 (both kinds), levy ₦5,000 per vehicle per month,
  and membership ₦30,000 a year (PAY-02). Every amount is an audited setting, and the levy
  may be set per vehicle category.
- **Dues schedule:** the levy runs by calendar month, from the month after onboarding. The
  membership fee covers 12 months from payment. Nothing is owed before those dates, and
  legacy balances are not honoured (PAY-03, PAY-04).
- **Refunds and receipts:** refunds only for a failed service, a duplicate, or a
  wrong-subject payment, excluding the processing fee. A PDF receipt accompanies every
  payment (PAY-08).
- **Channels:** NURTW dues are paid by payment link or dedicated virtual account. A sticker
  fee is **always** paid by payment link. Dedicated-account money splits at Paystack straight
  to the NURTW subaccount, so the contractor never holds Union funds.
- **Dedicated-account money** pays the oldest outstanding due first; any remainder is held
  as credit.
- **Dues status** is visible internally on scan and search, and never externally.

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

> **Superseded in part by revision 1.2 (§9A, §23.19).** A legacy barcode no longer resolves
> merely because it exists. It is imported unattached and resolves only once it has been
> reattached, under the controls of Requirement 9A.4. The paragraph below now describes an
> **attached** legacy sticker. The statement that "nothing presently in the field ceases to
> work" no longer holds: an unattached Transpay sticker produces no positive result from
> go-live.

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
4. *(Revision 1.2.)* A legacy barcode can be attached only if it is on the imported
   register, only to the plate the register records for it, only once, and only against an
   unused, confirmed payment. A fabricated timestamp is not on the register. A barcode
   copied from another vehicle fails the plate check, or is already attached. The register
   is closed (VEH-21), so no later import can add a barcode to it.

**Requirement 26.5.** Newly issued stickers use signed identifiers exclusively. The legacy
scheme is a read path for existing articles and must never be used to mint a new one.

---

## 27. Payments *(revision 1.2)*

Determined 22 September 2026; see §23.20 and `QUESTIONS.md` PAY-01 to PAY-13. This section
exists because §2.3 was invoked. The System collects payments; it is still not a
vehicle-registration authority, and a payment certifies nothing beyond itself.

**Requirement 27.1 — fee types are data.** A fee type carries:

- an immutable code and an editable label
- an amount, which may vary by vehicle category
- a recurrence: one-off, monthly, or yearly
- what it is charged against: a member or a vehicle
- its settlement: to the contractor alone, or split with the NURTW subaccount
- whether it is active

Creating, pricing, or retiring a fee type needs no deployment. The launch types are:

| Code | Recurrence | Charged against | Settlement | Channels |
|---|---|---|---|---|
| `STICKER_REATTACHMENT` | one-off | vehicle | contractor | payment link only |
| `STICKER_NEW` | one-off | vehicle | contractor | payment link only |
| `MEMBERSHIP` | yearly | member | split | link or dedicated account |
| `LEVY` | monthly | vehicle (PAY-03, pending confirmation) | split, amount per vehicle category | link or dedicated account |

The two sticker fees are separate types that start at the same placeholder amount. Whether a
vehicle receiving a new sticker pays the same as one having its Transpay sticker reattached
(VEH-20) is therefore a settings change, not a development task.

**Requirement 27.2 — amounts are settings.** Every amount, and every parameter of
Requirement 27.3, is runtime configuration, and every change is audited with a mandatory
reason. The launch amounts are set by the owner (PAY-02) and are not placeholders:

| Fee type | Launch amount |
|---|---|
| `STICKER_REATTACHMENT` | ₦2,000 |
| `STICKER_NEW` | ₦2,000 |
| `LEVY` | ₦5,000 per vehicle per month, every category, until per-category amounts are set |
| `MEMBERSHIP` | ₦30,000 per year |

A fee type created later may be marked as a **placeholder**, and in live mode the System
refuses to charge against a placeholder amount. Test mode is unaffected. Money is held as
integer kobo, never as a float.

**Requirement 27.3 — the processing fee.** The payer pays the due plus a processing fee,
shown as its own line, and the due is credited in full. For a due *d*:

- contractor fee *c* = min(0.5% of *d*, ₦200)
- total *T* = the smallest whole naira for which *T* − *P(T)* ≥ *d* + *c*
- *P(T)* is Paystack's fee for the channel. For local checkout it is 1.5% of *T* plus ₦100,
  with the ₦100 waived where *T* is below ₦2,500, capped at ₦2,000.

Rounding *T* up is deliberate: it never leaves the contractor short. The rule must reproduce
the owner's six worked figures at `QUESTIONS.md` PAY-10 exactly. It is an acceptance test,
not an illustration.

**Requirement 27.4 — splitting.** A split fee type is initialised with the NURTW subaccount,
a `transaction_charge` of *T* − *d*, and the main account bearing Paystack's fee. NURTW
therefore settles exactly *d*, and the contractor receives *c* plus the rounding. A
contractor-only fee type is initialised without a subaccount.

**Requirement 27.5 — confirmation.** A payment is confirmed only when both of the following
hold. It is never confirmed on a redirect, a client callback, or anyone's word. Processing is
idempotent by reference, so a replayed webhook changes nothing.

- a Paystack webhook arrives whose HMAC-SHA512 signature validates against the raw body
- server-side verification of the transaction matches the reference, the amount, and the
  currency the System asked for

**Requirement 27.6 — loss detection.** For each payment, Paystack's actual fee from the
verified transaction is recorded against the expected fee. Any payment where the contractor
netted less than *c* is flagged in a report. Paystack charges international cards at a higher
rate, so the Paystack business either has international payments disabled, or carries a
channel rate that covers them.

**Requirement 27.7 — channels** (PAY-06, PAY-11). A sticker fee is **always** paid by
payment link. NURTW dues may be paid by payment link or by dedicated virtual account.

A member's dedicated account is assigned with the NURTW subaccount, so its money splits at
Paystack and settles straight to NURTW. The contractor never holds Union funds. Because the
payer chooses the amount, Paystack applies the subaccount's **fixed percentage** to
dedicated-account payments rather than Requirements 27.3–27.4. That percentage is a setting.
The ₦200 cap and the fee-on-top cannot apply to a transfer the payer initiates. The System
therefore:

- shows the member the exact amount to send to cover a due
- credits whatever arrives, net of Paystack's fee and the contractor's percentage
- allocates it to the **oldest outstanding due first**, holding any remainder as credit
  against the next due to fall (PAY-12). The order is a setting.

Creating the Paystack customer behind a dedicated account sends Paystack only the fields it
requires.

**Requirement 27.8 — dues status is internal.** Whether a member's or vehicle's dues are
paid, owed, or in arrears is shown on internal scan and search results, beside the
verification result rather than in place of it. It appears in no external API response, on
no public page, and in no disclosure profile. Dues do not block card renewal; the officer
issuing a card sees the member's dues status instead (PAY-05).

**Requirement 27.9 — the ledger is append-only.** Payments and dues are never edited or
deleted. A correction or refund is a reversing entry (§4.8). Whether a due is paid derives
from the ledger, not from a flag that could be overwritten.

**Requirement 27.10 — secrets and card data.** The Paystack secret key is held only by the
API, from its environment. It never appears in the web application, a log, an error message,
or a URL. Card details never reach the System; only Paystack references are stored.

**Requirement 27.11 — audit.** Creating, confirming, failing, or refunding a payment, and
every change to a fee type, an amount, or the settlement account, emits an audit event with
before and after values.

**Requirement 27.12 — the NURTW settlement account** (PAY-07). The NURTW bank account is
entered from settings, not from configuration files, and can be changed at any time after
it is first set.

- The bank is chosen from Paystack's bank list. The account number is resolved through
  Paystack, and the account name is shown for confirmation before anything is saved.
- The first save creates the Paystack subaccount. Every later save **updates that same
  subaccount in place**, so existing dedicated accounts and outstanding payment links keep
  settling to NURTW without being reissued. Paystack pays out on its own schedule, so money
  collected but not yet paid out may settle to the new account.
- **Changing this account redirects all of the Union's dues.** It is the most valuable
  single action in the System to an attacker. It therefore requires its own permission,
  held by the super administrator alone unless expressly granted, and the user must re-enter
  their password. **No second approver is required** (PAY-13). The control is the audit
  trail, which must be complete:
  - every change is audited with its actor, time, IP address, request id, and a **mandatory
    reason**
  - before and after values give the bank, the account number, the resolved account name,
    and the subaccount code
  - failed attempts are audited too: a wrong password, a refused permission, or an account
    Paystack rejects
  - every previous account is kept in an append-only history, shown on the settings page
    itself, so a change cannot happen unseen

**Requirement 27.13 — the dues schedule** (PAY-03, PAY-04).

- **The levy** falls due per vehicle on the 1st of each calendar month, starting with the
  month after the vehicle is onboarded, with no proration.
- **The membership fee** covers the member for 12 months from the date it is paid. It first
  falls due on approval, or on the go-live date for a member migrated before it.
- Nothing is owed for any earlier period. Legacy balances are neither honoured nor
  migrated. Unpaid dues accumulate from the start dates onwards.

**Requirement 27.14 — refunds and receipts** (PAY-08).

- **Refunds** cover only a failed service, a duplicate payment, or a payment against the
  wrong member or vehicle.
  - They require a `payment.refund` permission, held by the super administrator alone
    unless granted, and a mandatory reason.
  - They are made through Paystack's refund API and recorded as a reversing ledger entry.
  - The due is refunded; the processing fee is not.
- **Receipts** are issued for every confirmed payment as a downloadable PDF. Each shows:
  - a receipt number, the payer, and what was paid (the due and its period)
  - the due, the processing fee, and the total
  - the Paystack reference and the date

  Paystack's email receipt goes to the payer where an email address is held. SMS receipts
  are deferred.

Nothing in §27 remains open.
