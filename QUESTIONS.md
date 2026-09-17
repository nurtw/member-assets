# Union Question Register

## NURTW Membership and Vehicle Verification System

**Document version:** 1.1
**Last revised:** 14 September 2026

---

## 1. Purpose

Every question the System requires the Union to answer, in one place, with its answer where
one has been given. It exists so that no decision is made on the Union's behalf by default,
and so that whoever resumes this work — on any day, from any starting point — can see at a
glance what is settled, what is waiting, and what is holding up delivery.

**Do not invent answers.** Where a question is open, the surrounding work is built and the
question is left open. A value assumed here would become indistinguishable from a value the
Union supplied, which is precisely the failure this register exists to prevent.

## 2. How to use this register

Answers arrive piecemeal, often verbally. When one does:

1. Fill in the **Answer**, **Answered on**, and **Answered by** lines on that question.
2. Change its status from ⏳ to ✅ in the index.
3. Where the answer is binding on implementation, add it to `PRD.md` §23 and cite the
   section back here under **Recorded at**. This register is the conversation; the PRD is
   the contract.

New questions are appended with the next number in their group. Identifiers are never
reused or renumbered, so a question can be cited in a meeting minute and still mean the same
thing a year later.

### Status

| | Meaning |
|---|---|
| ✅ | Answered and recorded |
| ⏳ | Awaiting the Union |
| 🔒 | Deferred by the Union — asked, consciously postponed |

---

## 3. Summary

| Group | Answered | Awaiting | Deferred | Total |
|---|---|---|---|---|
| Structure and master data (ORG) | 4 | 3 | — | 7 |
| Membership and registration (MEM) | 4 | 10 | — | 14 |
| Cards (CARD) | 4 | 4 | — | 8 |
| Vehicles and stickers (VEH) | 6 | 6 | — | 12 |
| Legacy migration (MIG) | 3 | 3 | — | 6 |
| External organisations (EXT) | 4 | 5 | — | 9 |
| Governance and go-live (GOV) | 4 | 10 | 1 | 15 |
| **Total** | **29** | **41** | **1** | **71** |

### Blocking production use right now

Four questions. None blocks *delivery* — all the surrounding work is built and tested — but
each stops the System being used for real in a specific way.

| ID | Question | What it stops |
|---|---|---|
| **ORG-05** | The Union's actual zones, branches, and units | Members can only be registered into the placeholder `Unassigned Zone / Branch / Unit` |
| **ORG-06** | The approved list of member designations | The designation prints blank on every card |
| **CARD-05** | The official card artwork at print resolution | Cards render from a template reconstructed from a photograph, which prints `PROVISIONAL TEMPLATE — ARTWORK PENDING` across its foot and must not be issued to a member |
| **CARD-07** | The signing officers and their signature images | Cards issue with blank President and General Secretary signature lines. Each such issuance is recorded in the audit trail, so they can be found and replaced afterwards — see `docs/reference/OPERATIONS.md` |

Everything else is either answered, or needed later and not yet obstructing work.

---

## 4. Open — required now

> These block roadmap item 05. Until they are answered, members can only be registered into
> the placeholder `Unassigned Zone / Branch / Unit` nodes.

### ORG-05 · The Union's organisational structure ⏳ (partly answered)

**Question.** Please provide the Union's zones; for each zone its branches; and for each
branch its units (unity bodies). Names as they should appear on a membership card.

**Why it is needed.** Every member, vehicle, officer, and permission is scoped to a node of
this structure. It is also what limits a branch administrator to their own branch — without
real nodes there are no real boundaries.

**Note.** The legacy export supplies none of this. `pit_name` is blank on all 2,841 vehicle
rows, so there is nothing to import and nothing to infer. A partial list is useful: the
structure is editable through the interface afterwards, and units can be added as they are
confirmed.

**Answer (partial).** The **21 Anambra LGAs are the zones** — the zone list is therefore the
LGA list already seeded (ORG-07 context), not a separate name set to be supplied. The **unit**
field is **hand-filled free text** at registration, not a controlled list. **Still
outstanding: the branch list** for each zone — nothing has been said about branches, and the
hierarchy (Council → Zone → Branch → Unit) still needs one per zone before real registration
can use it.
**Answered on.** 14 September 2026. **Answered by.** Mr Timothy, Head of Operations.
**Recorded at.** —

### ORG-06 · Member designations ⏳

**Question.** What are the approved NURTW designations a member may hold — the values that
print in the **Designation** field of the membership card?

**Why it is needed.** Designation is a required field on the registration form and a printed
field on the card.

**Note.** The legacy export carries no designation list. `owner_account_role` holds the
previous software's *account* roles (`VEHICLE_OWNER`, `DIRECTOR`, `AIRS_ADMIN`), which
describe system users rather than a member's Union designation. The list has therefore been
seeded as **empty** rather than guessed, because invented values would carry the appearance
of Union authority without having it.

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### ORG-07 · Zone, town, and locality lists ⏳

**Question.** Beyond LGAs, should **towns/cities** and **areas** be controlled lists the
System offers, or free text the applicant types?

**Why it is needed.** The registration form asks for Area and Town/City. A controlled list
gives clean reporting; free text is faster to launch and tolerant of local naming.

**Note.** The 21 Anambra LGAs are already seeded from public administrative geography and
cross-checked against the export. This question concerns the two finer-grained fields only.

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

---

## 5. Open — membership and registration (item 05)

### MEM-04 · Who approves a membership application ⏳

**Question.** Which officer approves a new membership, and at what level — unit, branch,
zone, or council? Is a second approval required for any category of applicant? In
particular: **may the officer who recorded an application also decide it?**

**Why it is needed.** Approval authority is a permission scoped to a node. "Branch secretary
approves for their own branch" and "council approves everything" produce materially
different systems.

**Note.** The System separates `member.create` from `application.decide`, and `card.issue`
from `card.approve` — but that separates the *permissions*, not the *people*. One user
holding both may do both, and the super administrator holds both by definition.

A second-officer requirement is **built and shipped off**, as the runtime setting
`approval.require_separate_officer`. Turning it on is a settings change, not a migration.
It ships off because with one administrator account, enforcing it would make a registration
impossible to complete. The officer who recorded each application is now stored, so the
control can be enforced retrospectively as well as prospectively. See
`docs/reference/OPERATIONS.md` → "Requiring a second officer to approve".

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### MEM-05 · Existing membership numbers ✅

**Question.** Do current members already hold membership numbers printed on cards in the
field? If so, must those be preserved, or will every member be issued a new number at
migration?

**Why it is needed.** Preserving existing numbers means the System must accept a format it
did not design and guarantee uniqueness across both schemes. Issuing fresh numbers is
cleaner but invalidates what members are carrying.

**Answer.** **Every member is issued a new, System-generated number.** No legacy number is
preserved or imported. This matches how the System already works — `membershipNumber` is
allocated on approval by the System, never accepted as input — so no change was needed to
honour this answer.
**Answered on.** 14 September 2026. **Answered by.** Mr Timothy, Head of Operations.
**Recorded at.** —

### MEM-06 · Guarantor requirements ⏳ (partly answered)

**Question.** Is **one** guarantor sufficient? Must a guarantor be an existing NURTW member
in good standing, and may one person guarantee more than one applicant?

**Why it is needed.** If guarantors must be members, the System can link and validate the
guarantor record; if not, guarantor details are free-standing personal data about a
non-member, which changes both the storage and the retention obligation.

**Answer (partial).** **The guarantor section is optional, not compulsory** — an application
may be submitted with no guarantor at all. **Still outstanding:** whether a guarantor, when
supplied, must be an existing member, and whether one guarantor may cover more than one
applicant. The registration form must therefore treat every guarantor field as optional, not
required.
**Answered on.** 14 September 2026. **Answered by.** Mr Timothy, Head of Operations.
**Recorded at.** —

### MEM-07 · Guarantor relationship values ⏳

**Question.** What values should the guarantor's **Relationship with Operator** field offer?

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### MEM-08 · The collateral question ⏳

**Question.** Confirm the exact printed wording of the collateral question, and whether the
vehicle referred to is a **tricycle**, a **motorcycle**, or "tricycle/motorcycle". Where the
answer is Yes, what collateral details must be recorded, and is documentary evidence
required?

**Why it is needed.** The form's photograph is not fully legible here, and the field appears
on a legal undertaking. The System must reproduce the Union's wording, not an approximation
of it.

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### MEM-09 · Date labels on the form ⏳

**Question.** Confirm the exact label beneath **Signature of operator** and beneath **Sign of
next of kin**. Both appear to be date fields but are not fully legible in the photograph.

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### MEM-10 · Guarantor local government area ⏳

**Question.** Does the guarantor's address section include a printed **Local Government
Area** field? It is not clearly visible in Section D of the form.

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### MEM-11 · Fields not visible on the photographed form ⏳

**Question.** Are there identifiers on the form not visible in the photograph — an
application number, date of registration, membership number, or staff verification fields?

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### MEM-12 · Eligibility criteria ⏳

**Question.** Is there a minimum age, residency requirement, or other criterion for
membership that the System should enforce or record?

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### MEM-13 · Rejected applications ⏳

**Question.** What becomes of a rejected application? Is it retained, for how long, and may
the applicant re-apply — immediately, or after a period?

**Why it is needed.** Retention of a rejected applicant's personal data requires a stated
basis and period; it cannot default to "forever".

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### MEM-14 · Passport photograph specification ⏳

**Question.** Any requirements for the passport photograph — background colour, dress,
recency, or an existing photographer arrangement?

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

---

## 6. Open — membership cards (item 06)

### CARD-04 · Card validity period at launch ✅

**Question.** What validity period should the launch card template carry? The supplied card
prints **2026** vertically at the same scale as the Union's name, which suggests annual
re-issuance is existing practice — please confirm.

**Why it is needed.** PRD §23.5 determined validity is configurable per template, so this is
a configuration value, not a design change. The year must be rendered as a prominent element
rather than small print, so it needs to be known before the template is cut.

**Answer.** **Confirmed: cards are renewed every year.** `v1-provisional.validityMonths` is
now `12`; a card issued today expires twelve months from its issue date.
**Answered on.** 14 September 2026. **Answered by.** Mr Timothy, Head of Operations.
**Recorded at.** `apps/api/src/card/templates/v1-provisional.ts`

### CARD-05 · Official card artwork ⏳

**Question.** Please supply the official card artwork at print resolution, together with the
Union emblem and wordmark.

**Why it is needed.** Cards must be visually indistinguishable from those already in
circulation. A reconstruction from a photograph will differ in ways members notice.

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### CARD-06 · The motto wording ⏳

**Question.** The supplied card shows the motto **twice, worded differently**: the emblem
reads *"Motto: Safety & Unity"* and the header beneath reads *"MOTTO: UNITY & SAFETY"*. The
field specification records *"Safety and Unity"*. Please confirm the exact wording in each
position on the official artwork.

**Why it is needed.** Both orderings appear on the same physical card. This is to be
reproduced, not corrected — a template that "fixes" one of them would differ visibly from
the article members hold.

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### CARD-07 · Signing officers ⏳ (partly answered)

**Question.** Which officers sign the membership card, and what are their names and titles as
printed? The card carries three signature lines: President, General Secretary, and Holder's
Signature. Please supply the two officers' signature images.

**Why it is needed.** PRD §23.7 determined signatures are stored assets composited at print.
The assets themselves are still required, and replacing one is an audited, permissioned act.

**Answer (partial).** **The signing officers are the State Chairman and the Secretary** — not
President and General Secretary as this question and the card's two internal signature slots
(`PRESIDENT`, `GENERAL_SECRETARY`) are named. No schema change is needed for this: the printed
title is a free-text `officerTitle` supplied when a signature is registered
(`docs/reference/OPERATIONS.md` → registering an officer signature), so the two existing slots
should be registered with `officerTitle: "State Chairman"` and `officerTitle: "Secretary"`
respectively when the images arrive. **Still outstanding:** the two officers' names and their
signature images, which is what actually unblocks issuing a real card.
**Answered on.** 14 September 2026. **Answered by.** Mr Timothy, Head of Operations.
**Recorded at.** —

### CARD-08 · Card replacement ⏳

**Question.** What is the process when a card is lost or damaged — who authorises a
replacement, and is the original marked lost, void, or superseded?

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

---

## 7. Open — vehicles and stickers (items 07–08)

### VEH-06 · Evidence required to declare a vehicle ⏳

**Question.** What must an operator produce before a vehicle is declared — proof of
ownership, roadworthiness, insurance, or nothing beyond the Union's own satisfaction?

**Why it is needed.** A declaration is expressly **not** an ownership claim, and the System
must not imply otherwise. Whatever is required should be recorded as having been seen, not
as having been verified by the Union.

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### VEH-07 · Resolving a disputed declaration ⏳

**Question.** When two members claim the same plate, who resolves it, by what process, and
within what period? PRD §23.9 determined the competing claim is refused and recorded as
**Disputed**, with both claims preserved — this asks who then acts on it.

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### VEH-08 · Vehicle transfer between members ⏳

**Question.** When a vehicle changes hands, who authorises the transfer, and does the sticker
travel with the vehicle or is a new one issued?

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### VEH-09 · Sticker validity period at launch ⏳

**Question.** What validity period should the launch sticker template carry, and does it run
on the same annual cycle as the card?

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### VEH-10 · Sticker stock control ⏳

**Question.** Who orders sticker stock, in what quantities, and how are unissued stickers
accounted for between the printer and the branch?

**Why it is needed.** Tamper-evident stock is the only defence against a genuine, validly
signed sticker being physically moved to another vehicle (PRD §26.4). Unissued stock going
missing defeats every cryptographic control in the System.

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### VEH-11 · Sticker replacement ⏳

**Question.** What is the process when a sticker is damaged, destroyed, or the vehicle
windscreen is replaced?

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### VEH-12 · Vehicle onboarding and binding pre-existing stickers ✅

**Question.** (Not previously asked as a formal question — direction volunteered ahead of
items 07–08 being planned.) How should vehicles already in the field, and the stickers
already on their windscreens, enter the System?

**Answer.** **Vehicles are onboarded afresh, not trusted as migrated.** Existing vehicles are
*updated* through the System rather than treated as already-declared; an officer binds a
pre-existing sticker to its vehicle record by **scanning it**, not by relying on the migrated
row alone.

**Pre-existing stickers use a different URL scheme, from a separate prior application**
(`transpaytms.com`), in two observed forms:

```text
https://www.transpaytms.com/v/status1772628860933
https://www.transpaytms.com/v/status/1772628860933
```

The trailing digits are the identifier to extract and search on — a millisecond epoch
timestamp, consistent with the legacy barcode scheme already determined at **CARD-03**
(PRD §26.4: legacy codes are millisecond timestamps, forgeable by inspection, honoured
read-only). A plate number is an equally valid way to find the vehicle where the sticker
cannot be read. **This is not yet built** — items 07 (vehicle declaration) and 08 (stickers)
are unplanned — but the URL shape and the extraction rule belong in that item's plan rather
than being re-derived or re-asked for later.

**Why it matters for MIG-04 and MIG-06.** This is a lean toward *not* over-investing in
migration reconciliation: rather than resolving every legacy owner/driver record
automatically, the operator re-registers or confirms the vehicle through the System, and the
old sticker is carried across by scan. MIG-04 and MIG-06 remain open on the specifics, but
"just create the system" was the direction given when those were raised.
**Answered on.** 14 September 2026. **Answered by.** Mr Timothy, Head of Operations.
**Recorded at.** —

---

## 8. Open — legacy migration (item 09)

### MIG-04 · Reconciling legacy vehicle owners to members ⏳

**Question.** The export holds owner details denormalised inside `owner_jsonb` on each
vehicle, plus a separate `drivers.csv` of 81 drivers. How should these become member records
— is the vehicle owner a member, the driver a member, or both?

**Why it is needed.** It determines how many members the migration creates and which of them
receive cards. The interim position is to import as recorded and reconcile afterwards, which
is safe but leaves work for staff.

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### MIG-05 · Ownership of the incomplete-record worklist ⏳

**Question.** Approximately 1,908 of 2,841 vehicles carry no local government area and will
import blank and flagged. Who works that list, and by when?

**Note.** PRD §23.18 forbids inferring an LGA from address text: an inferred value would be
indistinguishable from a recorded one. Correction is therefore a staff task, not a
migration task.

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### MIG-06 · Blacklisted and inactive legacy records ⏳

**Question.** The export marks some vehicles `INACTIVE` and some records `blacklisted`.
Should these migrate as-is, and what should each state mean in the new System?

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

---

## 9. Open — external organisations (items 11–12)

### EXT-05 · First organisations to onboard ⏳

**Question.** Which specific organisations should be onboarded first, and who is the named
technical contact at each?

**Why it is needed.** PRD §23.10 determined all four classes are eligible *subject to
individual approval*. This asks for the individuals.

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### EXT-06 · Who approves an external organisation ⏳

**Question.** Which Union officer approves an external organisation's access and signs the
data-sharing terms?

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### EXT-07 · Data-sharing agreement ⏳

**Question.** Does the Union have a data-sharing agreement or terms of use for external
organisations? If not, one is required before any external credential is issued.

**Why it is needed.** Every external credential discloses members' personal data to a third
party. The lawful basis and the recipient's obligations must be documented before, not
after.

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### EXT-08 · Withdrawal of access ⏳

**Question.** On what grounds is an external organisation's access withdrawn, and who
decides? Is there a notice period?

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### EXT-09 · Public verification page presentation ⏳

**Question.** Should the public verification page carry Union branding and a contact
number for disputing a result?

**Note.** PRD §23.13 determined the page is reachable **by QR scan only** — there is no form
to type into and no enumerable parameter. This concerns only what the resulting page shows.

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

---

## 10. Open — governance and go-live (item 15)

### GOV-05 · Initial administrators and officer roles ⏳

**Question.** Who are the Union's initial System administrators, and which officers should
hold which roles? Please supply names, official email addresses, and the branch or zone each
is limited to.

**Why it is needed.** One super administrator account exists. Every other officer needs an
account scoped to their own part of the Union.

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### GOV-06 · Who may hold `vehicle.declare` ⏳

**Question.** Beyond the super administrator, which named officers should be granted the
authority to declare a vehicle?

**Why it is needed.** PRD §4 and Decision 9.7 restrict this permission to the super
administrator and to those the super administrator expressly grants it to. It is in no role
bundle. This asks who those people are — the answer may legitimately be "nobody else".

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### GOV-07 · NDPC registration and Data Protection Officer ⏳

**Question.** Is the Union registered with the Nigeria Data Protection Commission, and who
is its Data Protection Officer or designated contact for data-protection matters?

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### GOV-08 · Domain names ⏳

**Question.** What domain names should serve the officer dashboard, the API, and the public
verification page?

**Why it is needed.** The verification page's address is printed or encoded on physical
stickers. Changing it later invalidates stickers already in the field.

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### GOV-09 · Incident contact and escalation ⏳

**Question.** Who at the Union is contacted in an incident — a suspected data breach, an
outage, or evidence of forged stickers — and who is authorised to declare one?

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### GOV-10 · Recovery objectives ⏳

**Question.** How much data may the Union tolerate losing in a disaster (recovery point),
and how long may the System be unavailable (recovery time)?

**Why it is needed.** These two numbers determine the backup design and its cost. They are
the Union's risk decision, not an engineering preference.

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### GOV-11 · Go-live date and parallel running ⏳

**Question.** What is the target go-live date, and will the previous system run in parallel
for a period? If so, which is authoritative during that period?

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### GOV-12 · Officer training and support ⏳

**Question.** Who trains branch and unit officers on the System, and where do they turn when
something does not work?

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### GOV-13 · Member-facing privacy notice ⏳

**Question.** Does the Union have a privacy notice explaining to members what is collected
and who it may be disclosed to? If not, one is required before go-live.

**Why it is needed.** Members supply next-of-kin and guarantor details — personal data about
third parties who never dealt with the Union directly.

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### GOV-14 · Subject access and correction requests ⏳

**Question.** How should a member request a copy of their data, or correction of it, and who
handles such a request?

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

---

## 11. Deferred by the Union

### GOV-04 · Lawful basis for cross-border transfer 🔒

**Question.** Production data will reside in an **EU region** (London or Frankfurt).
Storing Nigerian members' personal data outside Nigeria is a cross-border transfer under the
Nigeria Data Protection Act 2023. What is the Union's lawful basis for it?

**Status.** Asked and consciously deferred by the owner. Data residency itself is determined
(`ARCHITECTURE.md` Decision 10.4). Recording the lawful basis is a Union governance action
rather than an engineering task, and it gates no implementation work.

**Due.** Before go-live. It should not reach the go-live checklist unanswered.

**Answer.** _Deferred._
**Answered on.** — **Answered by.** — **Recorded at.** `ROADMAP.md` → Open questions

---

## 12. Answered

All determined on **9 September 2026** by the project owner unless noted. Each is binding;
where an implementation plan appears to require a different answer, the discrepancy is
recorded in `HANDOFF.md` and referred back rather than resolved in the plan.

### Structure and master data

| ID | Question | Answer | Recorded at |
|---|---|---|---|
| ORG-01 | How deep is the hierarchy? | Council → Zone → Branch → Unit → Member. Four levels beneath the council; a default node is seeded where a level is unused. | PRD §23.1 |
| ORG-02 | Are *Unit* and *Unity Body* one thing or two? | **One entity.** Code and administration say *Unit*; the form and card display *Unity Body*. | PRD §23.3 |
| ORG-03 | Is master data fixed in code or administrable? | Administrable, seeded from the legacy export, corrected by the Union thereafter. Delivery is not gated on the lists arriving first. | PRD §23.4 |
| ORG-04 | What does the card's **State** field mean? | The **issuing council's state** — `ANAMBRA` here. Stored as a field so further councils onboard without schema change. Distinct from the member's state of origin. | PRD §23.2 |

### Membership

| ID | Question | Answer | Recorded at |
|---|---|---|---|
| MEM-01 | Digital or wet signatures and photographs? | **Hybrid.** Captured digitally, with a print-ready form produced for wet signature where the process requires it. | PRD §23.16 |
| MEM-02 | How are officer signatures applied? | **Stored signature assets, composited at print.** Uploading or replacing one is a sensitive, audited permission. | PRD §23.7 |
| MEM-03 | How long are member records retained? | For the duration of the membership relationship. Audit events 7 years; API request logs 12 months. Retention is configuration; purging runs outside the application write path. | PRD §23.15 |

### Cards, stickers, and identifiers

| ID | Question | Answer | Recorded at |
|---|---|---|---|
| CARD-01 | Do cards and stickers expire? | **Configurable validity per template**, which may be *none*. Renewal can be introduced later without a migration. | PRD §23.5 |
| CARD-02 | What format are the numbers? | **Opaque but memorable, with an authenticity signature.** Human-readable identifiers use a grouped, unambiguous alphabet suitable for dictation; QR payloads additionally carry a cryptographic signature. | PRD §23.6, §26 |
| CARD-03 | Are the existing QR codes still honoured? | **Yes — resolved as fully equivalent.** Legacy barcodes are millisecond timestamps and forgeable by inspection; the risk was accepted to preserve 2,408 stickers already in the field. Read-only: no route can mint one. Which scheme resolved each verification is recorded. | PRD §26.4 |

### Vehicles

| ID | Question | Answer | Recorded at |
|---|---|---|---|
| VEH-01 | May a member declare several vehicles? | **Yes, without limit.** The legacy data confirms operators commonly run several. | PRD §23.8 |
| VEH-02 | What happens when two members claim one plate? | **One active declaration per normalised plate.** The competing claim is refused and recorded as **Disputed**; both claims and the full history are preserved. | PRD §23.9 |
| VEH-03 | Does verification create a declaration? | **No.** Declaration is a deliberate manual act by a holder of `vehicle.declare`. Verification is read-only and holds no write capability to declaration, sticker, card, or member tables. | PRD §4, §9.5–9.6 |
| VEH-04 | Who may declare a vehicle? | The **super administrator alone**, and those the super administrator expressly grants it to. In no other role bundle, including vehicle-record officer and branch or unit administrator. | PRD §4, Decision 9.7 |
| VEH-05 | Is step-up re-authentication required to declare? | **No** at launch. Built but disabled, and enableable by configuration. The residual risk is recorded and accepted. | Decision 9.7, `ROADMAP.md` risks |

### Legacy migration

| ID | Question | Answer | Recorded at |
|---|---|---|---|
| MIG-01 | What is migrated? | **Members and vehicles only.** Wallets, transactions, and charges are revenue data and out of scope. | PRD §2.2 |
| MIG-02 | Is the export complete? | **Confirmed complete.** The category distribution — including 7 tricycles among 2,841 vehicles — reflects what the previous system held. The migration is an opening baseline; later growth is expected, and the reconciliation report must not present it as an anomaly. | PRD §23.17 |
| MIG-03 | What of vehicles with no LGA? | **Import blank and flag for cleanup.** All 2,841 migrate; the ~1,908 lacking an LGA appear in a staff worklist. **Inference from address text is prohibited** — an inferred value would be indistinguishable from a recorded one. | PRD §23.18 |

### External access

| ID | Question | Answer | Recorded at |
|---|---|---|---|
| EXT-01 | Which organisation types are eligible? | All four, subject to individual approval: law enforcement and road agencies; insurers; financial institutions and asset financiers; other NURTW councils and state chapters. | PRD §23.10 |
| EXT-02 | How is a disclosure profile assigned? | **Per organisation at the point of approval**, amendable thereafter without a deployment. Not fixed by organisation class. | PRD §23.11 |
| EXT-03 | What may a verification response disclose? | Beyond the match result, and subject to profile: **vehicle category**, **sticker status**, **branch or unit label**, and **issue or validity date**. | PRD §23.14 |
| EXT-04 | Is there a public verification page? | **Yes, by QR scan only.** No form to type into and no enumerable query parameter; possession of the physical sticker is a precondition of any result. | PRD §23.13 |

### Governance and platform

| ID | Question | Answer | Recorded at |
|---|---|---|---|
| GOV-01 | What limits, quotas, and thresholds apply? | Proposal §14.2 rate limits adopted as launch configuration, adjustable at runtime. Token expiry **90 days** with advance rotation reminders. Aggregate totals below **25** suppressed. | PRD §23.12 |
| GOV-02 | Where is the System hosted? | API on DigitalOcean (containerised, cloud-agnostic), web on Vercel, database on Neon. | `CLAUDE.md` stack |
| GOV-03 | Where does production data reside? | An **EU region** — London or Frankfurt. See GOV-04 for the outstanding lawful-basis question this raises. | Decision 10.4 |
| GOV-15 | Can totals be fetched without filters? | **Yes** — a distinct permission returns the unfiltered grand total and **rejects any filter parameter outright**, separate from the filtered endpoint subject to the suppression floor. | PRD §13.2 |

---

## 13. Change log

| Date | Change |
|---|---|
| 14 September 2026 | Answers received from Mr Timothy, Head of Operations. MEM-05 and CARD-04 answered in full; ORG-05, MEM-06, and CARD-07 partly answered; new VEH-12 recorded (vehicle onboarding and legacy-sticker rebinding) with the pre-existing sticker URL format for items 07–08. Card template `v1-provisional` now carries a twelve-month validity; guarantor is no longer required to register an application. |
| 9 September 2026 | Register created. 26 answered, 43 awaiting, 1 deferred. ORG-05 and ORG-06 identified as blocking item 05. |
| 10 September 2026 | MEM-04 extended to ask explicitly whether the recording officer may decide. The control is built and shipped disabled; the question now gates a settings change rather than any development. |
| 9 September 2026 | Item 06 delivered. CARD-05 and CARD-07 added to the blocking list: neither blocked the build, both block printing a card for a member. CARD-04, CARD-06, and CARD-08 confirmed as configuration or authority questions that the built mechanism already accommodates. |
