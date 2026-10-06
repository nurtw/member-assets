# Delivery Roadmap

## NURTW Membership and Vehicle Verification System

**Document version:** 1.15
**Last revised:** 6 October 2026

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
| 08 | sticker-inventory-qr | §10 | complete | `plans/08-sticker-inventory-qr.md` |
| 09 | legacy-data-migration | §25, §9A | **done** (Neon repaired 26 Sep; legacy register loaded 27 Sep) | `plans/09-legacy-data-migration.md` |
| 10 | internal-verification | §11 | done (browser check pending) | [plan](plans/10-internal-verification.md) |
| 11 | api-clients-and-scopes | §12.1, §16 | done | [plan](plans/11-api-clients-and-scopes.md) |
| 12 | external-verification-api | §12, §15 | done | [plan](plans/12-external-verification-api.md) |
| 13 | rate-limiting-and-abuse | §14 | done | [plan](plans/13-rate-limiting-and-abuse.md) |
| 14 | aggregate-reporting | §13 | done | [plan](plans/14-aggregate-reporting.md) |
| 15 | go-live-hardening | §17, §21 | planned | [plan](plans/15-go-live-hardening.md) |
| 16 | payments | §27 | done (link payments, settlement account) | `plans/16-payments.md` |
| 17 | vehicle-onboarding | §9A | done (register on Neon 27 Sep; browser check pending) | `plans/17-vehicle-onboarding.md` |
| 18 | vehicle-letter | §9A.6 | done (not yet viewed by eye) | `plans/18-vehicle-letter.md` |
| 19 | vehicle-recording | §9.7–9.9 | done | `plans/19-vehicle-recording.md` |
| 20 | registration-flow | §9.10 | done (browser check pending) | `plans/20-registration-flow.md` |
| 21 | fee-type-settings | §27.1–27.2 | done (browser check pending) | `plans/21-fee-type-settings.md` |
| 22 | dues-schedule | §27.8, §27.13 | done (browser check pending) | `plans/22-dues-schedule.md` |
| 23 | dedicated-accounts | §27.7 | done (not yet tried in Paystack test mode) | [plan](plans/23-dedicated-accounts.md) |
| 24 | membership-verification | §11, §15 | done | [plan](plans/24-membership-verification.md) |
| 25 | dues-answers | §27.13 | done | [plan](plans/25-dues-answers.md) |
| 26 | letter-reissue | §9A.6 | done | [plan](plans/26-letter-reissue.md) |
| 27 | sticker-stock-and-scan | §9A.4, §9A.7, §9A.8 (rev. 1.12) | done (clicked through 6 Oct, with a stand-in for Paystack and a simulated camera) | [plan](plans/27-sticker-stock-intake.md) |
| 28 | officer-accounts-and-mfa | §16, §17.1 | done (requirement off until GOV-18; clicked through 5 Oct, second-factor enrolment not) | [plan](plans/28-officer-accounts-and-mfa.md) |
| 29 | organisation-portal | §12, §23.23 | done (clicked through 5 Oct) | [plan](plans/29-organisation-portal.md) |
| 30 | settlement-screen | §27.7, §27.12 | done (clicked through 5 Oct; no account saved at Paystack) | [plan](plans/30-settlement-screen.md) |
| 31 | pay-now | §27.8 (rev. 1.9) | done (clicked through 5 Oct; not through to a Paystack payment) | [plan](plans/31-pay-now.md) |
| 32 | app-shell-and-themes | `DESIGN.md` §3–§6 | done (clicked through 5 Oct) | [plan](plans/32-app-shell-and-themes.md) |
| 33 | organisations-and-invitations | §12, Req. 12.11 (rev. 1.10) | done (clicked through 5 Oct) | [plan](plans/33-organisations-and-invitations.md) |
| 34 | screen-restructure | `DESIGN.md` §5, §10–§12 | done (every screen swept 6 Oct) | [plan](plans/34-screen-restructure.md) |
| 35 | sticker-prompt | §9A.7 (VEH-30) | done (clicked through 5 Oct) | [plan](plans/35-sticker-prompt.md) |
| 36 | previous-operator-unnamed | §23.19, Req. 11.2 (rev. 1.12) | done | [plan](plans/36-previous-operator-unnamed.md) |

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

*Corrected 4 October 2026.* Item 03 delivered the tables, the permission check, and the
guard. It did **not** deliver any route or screen to create an officer, assign a role, grant
or revoke a permission, or compose a role, and no multi-factor sign-in or step-up existed
beyond unused columns. Those are item 28.

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
**unattached**, with attachment as a recorded event (Requirement 10.3), and hold the legacy
register (barcode bound to its recorded plate) that item 09 fills.
Sticker stock, opaque QR identifier generation, issuance,
replacement, and the nine-state sticker lifecycle. Depends upon item 07.

**09 — legacy-data-migration.** *PRD 1.2 — re-plan before executing:* legacy vehicles
import **on record only**, neither onboarded nor declared, and the 2,408 legacy barcodes
import **unattached** onto the legacy register (Requirement 9A.3). The register is closed
once imported: the previous operator has stopped issuing, so no refresh path is to be built (VEH-21).
Import of members, vehicles, drivers, and sticker requests
from `data/`. Wallets, transactions, and charges are excluded per PRD §2.2. Produces a
reconciliation report enumerating records that could not be imported and the reason,
including the approximately 67 per cent of vehicles carrying no local government area.

**10 — internal-verification.** The verification dashboard and officer portal; plate
lookup, QR lookup, and combined lookup with mismatch detection. First use of the shared
projection function of Decision 5.3.

Delivered as one route, `POST /verifications`, and a `/verify` page built for a phone. The
verdict follows VEH-22's rule, the one item 12 will share. Behind it, the internal result
shows every reason, and dues appear beside it within the officer's scope. A signed code is
checked before any lookup. Every check is audited, and nothing else is written.

**11 — api-clients-and-scopes.** External organisation registration and approval, token
issuance, hashing, rotation and revocation, the scope catalogue of PRD §12.2, and the
disclosure-profile records of Decision 5.2.

Delivered with an API access screen. An organisation is registered pending and approved
with a disclosure profile, its scopes, and a data-sharing agreement (PRD 1.5, Requirements
12.8–12.10). Its token is shown once and stored as a hash; a rotation keeps the old token
working for the overlap the officer chooses. A route that names a scope is reached by API
token only, and every other route by session only. Four profiles are seeded from PRD §15.
Item 12 adds the routes that use all this.

**12 — external-verification-api.** The four verification endpoints of PRD §12.3 under
scope enforcement and profile projection. Depends upon items 10 and 11.

Delivered as four `POST` routes under `/api/v1/verification`, reached by token only. They
read the same records and apply the same rule as the internal checks. A match carries the
fields its check may carry that the organisation's profile permits; every non-match is the
same answer, and the audit trail keeps the reason. Every request is logged once. No real
organisation should hold a token until item 13 adds rate limits.

**13 — rate-limiting-and-abuse.** Quota enforcement and abuse detection as the two distinct
layers of Decision 8.1, on shared external state per Decision 8.2, with runtime-configurable
limits. Limit determinations at PRD §23.12. Unblocked.

Delivered with limit profiles the Union changes on the API access screen, counters in
Postgres (PRD 1.6, §23.24), and daily quotas of 1,000 and 5,000. Over a limit, an
organisation is told `429` with `Retry-After`. Forged codes, plates or barcodes in sequence,
and a run of non-matches pause it for an hour, which an API administrator can lift with a
reason. External requests must send `X-Request-ID`. Organisations can now be given tokens.

**14 — aggregate-reporting.** *PRD 1.2:* the total counts only vehicles both onboarded and
declared, at `GET /api/v1/aggregates/vehicles` with a `vehicle_count` field and no
declaration-status filter (Requirements 12.7, 13.5). The vehicle totals endpoint at both tiers of
PRD §13.2: `aggregate:vehicles:total`, which returns the unfiltered grand total and rejects
any filter parameter outright, and `aggregate:vehicles:read`, which accepts the approved
filter dimensions subject to the below-25 suppression floor. Suppression is applied to the
computed result, so a suppressed total is indistinguishable from an available one by
timing or error class.

Delivered as two routes, one per scope (PRD 1.7, Requirement 13.8), and a metadata route
naming the zones, branches, and categories. Filtered totals are by zone or branch only,
rounded to the nearest 10, and suppressed below 25; periods are a month, quarter, or year.
Only vehicles declared and onboarded count.

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
"Recognised sticker — not attached". Depends on items 08, 09, and 16.

**18 — vehicle-letter.** *PRD 1.2, Requirement 9A.6.* A printable, downloadable letter on
onboarding, through a versioned `pdf-lib` template (`v1`) like the card. Its content is settled
at `QUESTIONS.md` VEH-19. It carries no QR code, and its signature lines stay blank until CARD-07.

**19 — vehicle-recording.** *PRD 1.3, Requirements 9.7–9.9.* `vehicle.record` and the Field
enumerator role; route type as master data; owner details in a separate sensitive table;
declaring an on-record vehicle updates the same row (Decisions 6.5–6.6). Also closes item
07's outstanding promotion fix.

**20 — registration-flow.** *PRD 1.3, Requirement 9.10.* The web flow from saving a member
straight to recording that member's vehicle, or skipping it. Depends on item 19.

**21 — fee-type-settings.** *PRD 1.3, Requirements 27.1–27.2.* Audited editing of fee-type
amounts, a levy amount per route type, the levy at ₦7,000, and payment initiation charging
the vehicle's route-type amount. Depends on item 19.

**22 — dues-schedule.** *Requirements 27.8, 27.13.* Which levy months and membership years
are owed, derived from the ledger, and dues status on internal screens only. Depends on
items 17 and 21.

**23 — dedicated-accounts.** *Requirement 27.7, PAY-11, PAY-12, PAY-17.* A Paystack dedicated
account per member, split to the NURTW subaccount, crediting oldest dues first. Dedicated
accounts are enabled on the Paystack business. Depends on item 22.

**24 — membership-verification.** *PRD 1.4, §11.* An officer checks a membership card by its
card number or membership number, on the Verify screen. Internal only; the external
membership endpoint (item 12) reuses its rule. Depends on item 10.

**25 — dues-answers.** *PRD 1.4, PAY-18 and PAY-19.* A membership fee paid early extends
cover from its end. The levy stops after the month a vehicle is retired in, and each month
is priced at the route type the vehicle had on its 1st. Amends item 22.

**26 — letter-reissue.** *PRD 1.4, VEH-27.* An officer holding `sticker.attach` reissues a
vehicle's letter with a reason. The old letter is kept, marked superseded. Amends item 18.

**27 — sticker-stock-and-scan.** *PRD 1.12; VEH-29 and VEH-31, taken up by the owner on
5 October 2026.* Printed stickers the register never recorded are scanned into stock by
holders of `sticker.stock_intake`, a permission in no role. Assigning a sticker becomes pay
first, then scan with the camera, then confirm; a stock sticker goes on any vehicle at the
new-sticker fee. Amends items 08, 17, and 35.

**28 — officer-accounts-and-mfa.** *PRD §16, §17.1; found missing on 4 October 2026.*
Creating and deactivating officers with a temporary password, assigning roles by scope,
granting and revoking single permissions, composing roles, and multi-factor sign-in for
privileged permissions. Blocked go-live: without it nobody but the seeded administrator
could sign in. Delivered on 4 October 2026 (PRD 1.8). The second-factor requirement ships
off (`auth.mfa_enforced`) and must be turned on before go-live (GOV-18).

**29 — organisation-portal.** *PRD §12, §23.23; the owner's direction of 5 October 2026.*
An outside organisation applies for access itself, through a portal of its own, and sees its
own usage and manages its own tokens there. Approval stays with the API administrator,
who first confirms the applicant by telephone or letter (EXT-20, Requirement 12.11).
Delivered on 5 October 2026.

**30 — settlement-screen.** *PRD Requirements 27.7, 27.12; approved 5 October 2026.* A
Settings page for the NURTW settlement account and the dedicated-account percentage
(PAY-11), over the two routes item 16 and item 23 built. Today both are reachable only by
calling the API directly.

**31 — pay-now.** *PRD Requirement 27.8 (revision 1.9), PAY-21; approved 5 October 2026.*
A Pay now button beside what is owed on an officer's check (a QR code and link, and the
member's dedicated account), and a personal pay link for each vehicle and member that opens
a public payment page never saying what is owed. The public sticker page (§23.13) is not
built and waits on GOV-08; it gets the same button when it is. Comes after item 30, before
item 15.

**Click-through of 5 October 2026.** The officers' screens, the settlement screen, Pay now
and the public pay page, and the organisation portal were driven in a browser against the
local stack. It led to four fixes: an officer with no role is told so instead of being
shown a refusal; a payment Paystack will not start is closed as failed and answers 503;
and two phone layouts in the portal. Not reached: second-factor enrolment, a card or
sticker issued, a registration completed, and a payment taken through to Paystack.

**32 — app-shell-and-themes.** *The owner's direction of 5 October 2026; `DESIGN.md` 1.1.*
One frame for every officer screen: a sidebar grouped by task, breadcrumbs, a command
menu, and Light, Dark, and System themes applied before the first paint. Every colour
becomes a token, so every screen works in both themes and every verdict still passes
`DESIGN.md` §3. Comes before items 33 and 34.

**33 — organisations-and-invitations.** *PRD Requirement 12.11 (revision 1.10), EXT-21;
the owner's direction of 5 October 2026.* A page for outside organisations in place of
Settings → API access, and a personal link the administrator shares to invite one, which
opens the application form addressed to it. Confirmation and approval are unchanged.

**34 — screen-restructure.** *The owner's direction of 5 October 2026.* Every screen moved
onto the same patterns; a Home of one screen with each officer's quick actions and what
waits for them; and a public front page showing the ways in. Screens for what
the API can do but no screen offers (the Union's structure, master data, officer
signatures, a member list) are separate items, not this one.

**35 — sticker-prompt.** *PRD §9A, VEH-30; the owner's direction of 5 October 2026.* A
banner on every vehicle without a sticker, and a prompt to buy and attach one when a
vehicle has just been added, which can be closed. While new NURTW stickers are paused, a
vehicle the legacy register holds no barcode for is told so, and nothing is charged.
Built after item 32, before item 33.

**36 — previous-operator-unnamed.** *GOV-21; the owner's direction of 5 October 2026.* The
previous operator's name is taken out of every file, a test fails if it returns, and no
screen says which scheme a sticker belongs to.

**Also on 3 October 2026 (PRD 1.4, VEH-28).** A vehicle's declaration status is shown only
to holders of `vehicle.declare`, on every screen and route. This amended items 07 and 10.
New signed NURTW stickers are paused. Onboarding was by reattachment only until item 27
added stickers from stock.

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

*PRD 1.3 additions:*

```text
19 --+-> 09 (owner details, local run)
     +-> 20
     +-> 21 --+
         17 --+-> 22 -> 23
```

Order of work: 19, then item 09's local run (so the report can be reviewed while the rest
proceeds), then 20, 21, 17, 22, 23. Every 1.3 question is answered (`QUESTIONS.md` VEH-23 to
VEH-26, MIG-04, MIG-07, PAY-14 to PAY-17).

*The interface, 5 October 2026:*

```text
29 --+
32 --+-> 35 -> 33 -> 34
```

Order of work, as the owner chose: 32, 35, and 33 (done), then 34. Items 36 and 27 were
asked for on 5 October 2026 while 34 was under way, and done first; 34 was then finished,
with the two landing pages the owner asked for the same day. Item 15 is independent
of them.

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
| Legacy barcodes are millisecond timestamps, deducible from one genuine sticker and carrying no authenticity proof | **Revised 22 September 2026 (PRD 1.2).** Legacy barcodes import unattached and resolve only once reattached. Reattachment requires the barcode to be on the imported register, bound to its recorded plate (no override), attached only once, and paid for. The previous operator has stopped issuing, so the register is closed and cannot be added to (`QUESTIONS.md` VEH-21). | PRD §9A, §26.4, `ARCHITECTURE.md` 6.4 |
| A hijacked session holding `vehicle.declare` may create declarations, as step-up is not enabled | Accepted, and materially reduced on 9 September 2026 by restricting the permission to the super administrator plus express per-user grants. Bounded further by organisational scope, complete audit trail, and the absence of any other route to create a declaration. Step-up is built and may be enabled by configuration. | `ARCHITECTURE.md` 9.7 |
| The shared database holds a pre-1.2 legacy import: 2,838 legacy vehicles marked declared, no owner details | Found 26 September 2026. Nothing depends on those rows yet. `migrate:legacy -- --repair` corrects them in place, audited, and was verified locally. **Closed 26 September 2026:** approved by the owner and completed. All 2,841 are on record with owner details, with one audit event each. | `plans/09-legacy-data-migration.md` |
| Item 08's sticker attachment accepted any confirmed payment, whatever its fee type or vehicle | Found and closed 26 September 2026 (item 17). No attachment existed on the shared database, so nothing was funded wrongly. | `plans/17-vehicle-onboarding.md` |
| Approximately 67 per cent of migrated vehicles will carry no local government area | Accepted. Imported blank and flagged for operational cleanup. Inference from address text is prohibited: an inferred value would be indistinguishable from a recorded one. | PRD §23.18 |
