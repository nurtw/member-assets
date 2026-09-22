# Delivery Roadmap

## NURTW Membership and Vehicle Verification System

**Document version:** 1.2
**Last revised:** 22 September 2026

---

## Source

Derived from `PRD.md`, which is itself derived from
`docs/Proposal_for_the_Development_and_Implementation_of.md` and
`docs/National_Union_of_Road_Transport_Workers_(NURTW).md`. Ordering and scoping respect
the decisions recorded in `ARCHITECTURE.md`.

## Goal

Deliver a Union-owned platform that administers members, declared vehicles, membership
cards, and vehicle stickers, and that answers verification enquiries from Union officers
and approved external organisations under strict disclosure, rate-limiting, and audit
controls.

## Items

Each item is independently completable and independently testable. Status values are
`not-started`, `planned`, `in-progress`, `done`.

| # | Item | PRD ref | Status | Plan |
|---|---|---|---|---|
| 01 | monorepo-scaffold | §20 | **done** | `plans/01-monorepo-scaffold.md` |
| 02 | core-data-model | §24, §7–10 | **done** | `plans/02-core-data-model.md` |
| 03 | auth-and-permissions | §16, §17 | **done** | `plans/03-auth-and-permissions.md` |
| 04 | org-hierarchy | §6 | **done** | `plans/04-org-hierarchy.md` |
| 05 | membership-application | §7 | **done** | `plans/05-membership-application.md` |
| 06 | membership-card-issuance | §8 | complete | `plans/06-membership-card-issuance.md` |
| 07 | vehicle-declaration | §9 | complete | `plans/07-vehicle-declaration.md` |
| 08 | sticker-inventory-qr | §10 | not-started | `plans/08-sticker-inventory-qr.md` |
| 09 | legacy-data-migration | §25, §9A | planned — **re-plan required** (PRD 1.2) | `plans/09-legacy-data-migration.md` |
| 10 | internal-verification | §11 | not-started | `plans/10-internal-verification.md` |
| 11 | api-clients-and-scopes | §12.1, §16 | not-started | `plans/11-api-clients-and-scopes.md` |
| 12 | external-verification-api | §12, §15 | not-started | `plans/12-external-verification-api.md` |
| 13 | rate-limiting-and-abuse | §14 | not-started | `plans/13-rate-limiting-and-abuse.md` |
| 14 | aggregate-reporting | §13 | not-started | `plans/14-aggregate-reporting.md` |
| 15 | go-live-hardening | §17, §21 | not-started | `plans/15-go-live-hardening.md` |
| 16 | payments | §27 | planned | plans/16-payments.md |
| 17 | vehicle-onboarding | §9A | not-started | — |
| 18 | vehicle-letter | §9A.6 | not-started | — |

### Item summaries

**01 — monorepo-scaffold.** Repository, package manager, workspace configuration, NestJS
and Next.js applications, the `contracts` and `domain` packages, linting, formatting,
testing harness, continuous integration. Replaces the placeholder Commands section of
`CLAUDE.md` with real commands.

**02 — core-data-model.** The Prisma schema for organisation, member, application,
vehicle, sticker, card, API client, and audit entities, following the canonical field
names of PRD §24. Establishes the separation of sensitive from card-display data required
by Decision 10.1, and the initial migration.

**03 — auth-and-permissions.** Internal authentication and the permission model of
`ARCHITECTURE.md` Decisions 9.2–9.9: a seeded permission catalogue, the eleven roles of
PRD §16 as immutable system bundles, per-user grants and revocations with revocation
prevailing, organisational scoping of every assignment, custom role composition, and
multi-factor authentication for privileged roles. Step-up re-authentication is built but
left disabled. `vehicle.declare` is seeded into the super administrator bundle only and
into no other role; the interface must be able to enumerate who currently holds it and
within what scope (Decision 9.7.1). External client authentication is deliberately
excluded and belongs to item 11.

**04 — org-hierarchy.** Council, zone, branch, and unit, together with the master-data
administration interface. Hierarchy and master-data determinations at PRD §23.1, §23.3,
§23.4. Delivered with record-scoped authorisation on every route, a move authorised at both
origin and destination, deactivation in place of deletion, and the generated API reference
at `docs/reference/`.

The legacy export was found to carry **no** zones, branches, units, or designations —
`pit_name` is blank on all 2,841 rows, and `owner_account_role` holds the previous
software's account roles rather than member designations. Local government areas are the
only master data the export supplies, and they are seeded. The Union's structure is
therefore built through the interface, and the placeholder nodes remain as the Requirement
6.1 default until it is.

**05 — membership-application.** The registration form of
`docs/National_Union_of_Road_Transport_Workers_(NURTW).md` in full, the review and approval
workflow, member status management, and upload handling for photographs and signatures.
Numbering and signature determinations at PRD §23.6, §23.16, §26.

Delivered with the System's first officer-facing screens: sign-in, the application list, the
registration form, and the review screen. A membership number is allocated on approval and
not before, and `member.create` does not confer `application.decide` — the officer who
records an application cannot decide it. The print-ready wet-signature form is deferred to
item 06, which needs the same PDF pipeline for cards.

**06 — membership-card-issuance.** Card templates carrying a version, card-number
generation, the issuance and replacement workflow, and the nine-state card lifecycle.
Validity and numbering determinations at PRD §23.5, §23.6, §23.7.

Delivered with the print pipeline item 05 deferred here, so the wet-signature registration
form lands in the same item. A card number is allocated on issuance and not before; an
unissued card renders overprinted `PROOF — NOT ISSUED`; the printed values are snapshotted
on the card row so a card re-renders exactly as it was printed. Print rendering is `pdf-lib`
with no browser in the container (Decision 14.1). The launch template is marked provisional
until the Union supplies its artwork (CARD-05).

**07 — vehicle-declaration.** Declaration records, plate normalisation, duplicate and
conflict detection, the six-state declaration lifecycle, and preservation of historical
association on transfer or retirement.

**08 — sticker-inventory-qr.** *PRD 1.2:* the sticker schema must allow a sticker to exist
**unattached**, with attachment as a recorded event (Requirement 10.3), and hold the Transpay
register (barcode bound to its recorded plate) that item 09 fills.
Sticker stock, opaque QR identifier generation, issuance,
replacement, and the nine-state sticker lifecycle. Depends upon item 07.

**09 — legacy-data-migration.** *PRD 1.2 — re-plan before executing:* legacy vehicles
import **on record only**, neither onboarded nor declared, and the 2,408 legacy barcodes
import **unattached** onto the Transpay register (Requirement 9A.3). The register is closed
once imported: Transpay has stopped issuing, so no refresh path is to be built (VEH-21).
Import of members, vehicles, drivers, and sticker requests
from `data/`. Wallets, transactions, and charges are excluded per PRD §2.2. Produces a
reconciliation report enumerating records that could not be imported and the reason,
including the approximately 67 per cent of vehicles carrying no local government area.

**10 — internal-verification.** The verification dashboard and officer portal; plate
lookup, QR lookup, and combined lookup with mismatch detection. First use of the shared
projection function of Decision 5.3.

**11 — api-clients-and-scopes.** External organisation registration and approval, token
issuance, hashing, rotation and revocation, the scope catalogue of PRD §12.2, and the
disclosure-profile records of Decision 5.2.

**12 — external-verification-api.** The four verification endpoints of PRD §12.3 under
scope enforcement and profile projection. Depends upon items 10 and 11.

**13 — rate-limiting-and-abuse.** Quota enforcement and abuse detection as the two distinct
layers of Decision 8.1, on shared external state per Decision 8.2, with runtime-configurable
limits. Limit determinations at PRD §23.12. Unblocked.

**14 — aggregate-reporting.** *PRD 1.2:* the total counts only vehicles both onboarded and
declared, at `GET /api/v1/aggregates/vehicles` with a `vehicle_count` field and no
declaration-status filter (Requirements 12.7, 13.5). The vehicle totals endpoint at both tiers of
PRD §13.2: `aggregate:vehicles:total`, which returns the unfiltered grand total and rejects
any filter parameter outright, and `aggregate:vehicles:read`, which accepts the approved
filter dimensions subject to the below-25 suppression floor. Suppression is applied to the
computed result, so a suppressed total is indistinguishable from an available one by
timing or error class.

**15 — go-live-hardening.** Security testing, API abuse testing, backup and restoration
procedures, monitoring and alerting, the incident-response document, production
provisioning subject to Decision 10.4, and verification of the twelve acceptance criteria
of PRD §21.

**16 — payments.** *PRD 1.2, §27.* Fee types as data, with amounts and processing-fee
parameters as settings. Placeholder amounts are refused in live mode. The processing-fee rule
must reproduce the six worked figures at `QUESTIONS.md` PAY-10. Paystack payment links carry a
per-payment split to the NURTW subaccount. Confirmation needs a signed webhook plus
server-side verification. The ledger is append-only, with a loss-detection report and dues
status for internal scan and search. NURTW dues can be paid by link or by dedicated
account; sticker fees by link only. A settings page lets the NURTW settlement account be
added and later changed, updating the one Paystack subaccount in place, behind its own
permission and a password re-entry (Requirement 27.12).

**17 — vehicle-onboarding.** *PRD 1.2, §9A.* Separates on record, onboarded, and declared.
Reattaches legacy barcodes under the four controls of Requirement 9A.4, and onboards
vehicles with no legacy sticker by issuing a new signed one. Internal scans show
"Recognised Transpay sticker — not attached". Depends on items 08, 09, and 16.

**18 — vehicle-letter.** *PRD 1.2, Requirement 9A.6.* A printable, downloadable letter on
onboarding, through a versioned `pdf-lib` template (`v1`) like the card. Its content is settled
at `QUESTIONS.md` VEH-19. It carries no QR code, and its signature lines stay blank until CARD-07.

## Dependencies

```
01 -> 02 -> 03 -> 04 -> 05 -> 06
                   |
                   +-> 07 -> 08 -> 09
                                    |
                              06 ---+-> 10 -> 12 -> 14
                                          |     |
                                    11 ---+     +-> 13
                                                      |
                                                      +-> 15
```

Items 06 and 07 may proceed in parallel once item 04 is complete.

*PRD 1.2 additions:*

```
08 -> 09 --+
           +-> 17 -> 18
     16 ---+    |
                +-> 14   (the external total counts onboarded AND declared)
```

Item 16 (payments) depends only on item 03 and can start at once in Paystack test mode.
Real amounts (PAY-02) and the NURTW subaccount (PAY-07) gate going live, not building.
All item 16-18 questions are
answered (`QUESTIONS.md` PAY-01-13, VEH-18-22).

## Open questions

The full register, answered and unanswered, is [QUESTIONS.md](QUESTIONS.md). Two questions
now gate delivery: **ORG-05** (the Union's zones, branches, and units) and **ORG-06** (the
approved member designations). Both are required before item 05 can register a member into a
real unit, and neither can be derived from the legacy export.

**The eighteen proposal determinations are closed.** The sixteen questions at proposal §23
and two arising from the legacy export were all determined on 9 September 2026 and are
recorded at PRD §23. None of those is outstanding.

ORG-05 and ORG-06 above are **not** among them. They arose during item 04, when inspection
of `data/` established that the export carries no zones, branches, units, or designations to
seed — `pit_name` is blank on all 2,841 vehicle rows, and `owner_account_role` holds the
previous software's account roles rather than member designations. PRD §23.4 correctly
determined that item 04 was not gated on these lists arriving; item 05 is.

Of the three matters previously listed as outstanding, two are now closed and one is
deferred by the owner:

1. **Item 09 — completeness of the legacy export. CLOSED, 9 September 2026.** Confirmed
   complete at PRD §23.17. The category distribution reflects what the previous system
   held; the migration establishes an opening baseline, and new vehicles — tricycles
   included — are registered through the System from go-live. The reconciliation report
   must not present the tricycle count as an anomaly.
2. **Item 15 — lawful basis for cross-border transfer. DEFERRED by the owner.** Data
   residency is determined (EU region, `ARCHITECTURE.md` Decision 10.4). Recording the
   lawful basis for the transfer under the Nigeria Data Protection Act 2023 remains
   outstanding and is to be addressed before go-live. This is a Union governance action,
   not an engineering task, and gates no implementation work.
3. **Item 08 — sticker substrate. CLOSED, 9 September 2026.** Destructible or
   tamper-evident stock is already in place. Recorded as satisfied at PRD §26,
   Requirement 26.4, where it is also marked load-bearing: it is the only defence against
   a genuine, validly signed sticker being physically moved between vehicles.

## Recorded risks

| Risk | Determination | Recorded at |
|---|---|---|
| Legacy barcodes are millisecond timestamps, deducible from one genuine sticker and carrying no authenticity proof | **Revised 22 September 2026 (PRD 1.2).** Legacy barcodes import unattached and resolve only once reattached. Reattachment requires the barcode to be on the imported register, bound to its recorded plate (no override), attached only once, and paid for. Transpay has stopped issuing, so the register is closed and cannot be added to (`QUESTIONS.md` VEH-21). | PRD §9A, §26.4, `ARCHITECTURE.md` 6.4 |
| A hijacked session holding `vehicle.declare` may create declarations, as step-up is not enabled | Accepted, and materially reduced on 9 September 2026 by restricting the permission to the super administrator plus express per-user grants. Bounded further by organisational scope, complete audit trail, and the absence of any other route to create a declaration. Step-up is built and may be enabled by configuration. | `ARCHITECTURE.md` 9.7 |
| Approximately 67 per cent of migrated vehicles will carry no local government area | Accepted. Imported blank and flagged for operational cleanup. Inference from address text is prohibited: an inferred value would be indistinguishable from a recorded one. | PRD §23.18 |
