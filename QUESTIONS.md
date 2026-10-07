# Union Question Register

## NURTW Membership and Vehicle Verification System

**Document version:** 1.17
**Last revised:** 7 October 2026

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
| Membership and registration (MEM) | 7 | 11 | — | 18 |
| Cards (CARD) | 5 | 3 | — | 8 |
| Vehicles and stickers (VEH) | 27 | 8 | — | 35 |
| Legacy migration (MIG) | 5 | 2 | — | 7 |
| External organisations (EXT) | 19 | 2 | — | 21 |
| Payments (PAY) | 21 | 0 | — | 21 |
| Governance and go-live (GOV) | 10 | 10 | 1 | 21 |
| **Total** | **98** | **39** | **1** | **138** |

### Blocking production use right now

Four questions. None blocks *delivery* — all the surrounding work is built and tested — but
each stops the System being used for real in a specific way.

| ID | Question | What it stops |
|---|---|---|
| **ORG-05** | The Union's real branches (zones and units are now answered) | Below zone level, members can only be registered into the placeholder `Unassigned Branch / Unit`, or a demo branch/unit — see below |
| **ORG-06** | The approved list of member designations | The designation prints blank on every card, unless demo designations are seeded — see below |
| **CARD-05** | The full print-resolution card artwork (the emblem itself is now supplied — see above) | Cards render from a template reconstructed from a photograph and print `PROVISIONAL TEMPLATE — ARTWORK PENDING` across the foot; must not be issued to a member |
| **CARD-07** | The signing officers' real names and signature images (the titles are now known) | Cards issue with blank signature lines. Each such issuance is recorded in the audit trail, so they can be found and replaced afterwards — see `docs/reference/OPERATIONS.md` |

**For a demo deployment**, `SEED_DEMO_DATA=true` (`apps/api/prisma/seed.ts`) creates one
branch and unit under each of the 21 real zones, and an 8-entry designation list, so a full
registration and card issuance can be demonstrated end to end. **This is placeholder content
the project owner asked for to unblock a demo, not a Union answer** — it is clearly marked
"(demo)" in the organisation tree and its designation codes are prefixed `DEMO_`, and it must
not be mistaken for ORG-05 or ORG-06 being answered. It does not run by default. Signature
images (CARD-07) and the full card artwork (CARD-05) are not stood in for this way: a
fabricated signature or emblem would misrepresent a real person or the Union's actual
artwork, so those stay genuinely blank/provisional even in a demo.

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

**Further, 6 October 2026.** Going through the registration form on the live System,
Mr Timothy asked that **the word "demo" be removed** from the unit names offered there.
Those names are the placeholders described in section 3: one branch and one unit beneath
each zone, named after the zone. **Not settled by this:** whether the placeholders are to
stand as the Union's real branches and units, or whether the unit is to be typed in by hand,
as he said on 14 September. Removing the word without that answer would present placeholder
names as the Union's own. The names can now be changed by the Union itself, on the Union
structure screen (roadmap item 38).

### ORG-06 · Member designations ⏳ (partly answered)

**Question.** What are the approved NURTW designations a member may hold — the values that
print in the **Designation** field of the membership card?

**Why it is needed.** Designation is a required field on the registration form and a printed
field on the card.

**Note.** The legacy export carries no designation list. `owner_account_role` holds the
previous software's *account* roles (`VEHICLE_OWNER`, `DIRECTOR`, `AIRS_ADMIN`), which
describe system users rather than a member's Union designation. The list has therefore been
seeded as **empty** rather than guessed, because invented values would carry the appearance
of Union authority without having it.

**Answer (partial).** **Driver comes first in the list and Conductor second**, ahead of
Chairman, Secretary, and every other position, "since we are concentrating on drivers".
**Still outstanding: the list itself.** Mr Timothy was looking at the eight placeholder
designations and asked only for their order to change. That is not a statement that those
eight are the approved list, and their codes stay prefixed `DEMO_` until it is given.
**Answered on.** 6 October 2026. **Answered by.** Mr Timothy, Head of Operations, in a
recorded walk-through of the live System, passed on by the project owner on 7 October 2026.
**Recorded at.** —

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

**Further, 6 October 2026.** A guarantor is still not compulsory. Where one is given, the
form asks for **full name, telephone number, and address**, and "every other thing is not
compulsory". He asked that the next-of-kin and guarantor parts of the form be "reduced very,
very drastically". Read here as: those three fields are what the form shows, and the
relationship, occupation, town, and collateral fields leave it. That reading is put to the
owner in `plans/42`, and nothing is removed before it is approved. MEM-07, MEM-08, and MEM-10
ask about fields this would remove; they stay open until then.

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

### MEM-15 · The order of a member's details on the form ✅

**Question.** (Raised by Mr Timothy, going through the live form.) In what order should the
member's own details be asked?

**Answer.** **Name, then address, then telephone number, before anything else.** The
telephone number was last in Section A.
**Answered on.** 6 October 2026. **Answered by.** Mr Timothy, Head of Operations, in a
recorded walk-through of the live System, passed on by the project owner on 7 October 2026.
**Recorded at.** `plans/41`. A change to the screen only; no rule changes.

### MEM-16 · What is asked about the next of kin ✅

**Question.** (Raised by Mr Timothy.) Which details of the next of kin does the Union need?

**Answer.** **Full name and telephone number.** One field for the full name, not surname,
first name, and middle name. **An address may be given and is not required.** Nothing else
is needed: no town, local government area, state of origin, or occupation.

**Consequences.** The form and the API require a surname, a first name, and an address
today, and the database holds the name in three columns. Changing that is a change to the
rule and to the schema, planned in `plans/42`. Details already recorded are kept.
**Answered on.** 6 October 2026. **Answered by.** Mr Timothy, Head of Operations, in a
recorded walk-through of the live System, passed on by the project owner on 7 October 2026.
**Recorded at.** — (PRD §7 is revised when `plans/42` is built.)

### MEM-17 · Area, and Town or City ⏳ (partly answered)

**Question.** The Union's printed form asks for both an **Area** and a **Town / City**. What
is the difference, and should the System ask for both?

**Answer (partial).** Mr Timothy does not know the difference himself. He asked that the
form **explain each in brackets, or else drop Area and keep Town / City**. **Still
outstanding:** what Area means on the Union's form, if it is kept. No definition is invented
here. `plans/42` recommends that the form stop asking for Area, and that what is already
recorded be kept. See also ORG-07.
**Answered on.** 6 October 2026. **Answered by.** Mr Timothy, Head of Operations, in a
recorded walk-through of the live System, passed on by the project owner on 7 October 2026.
**Recorded at.** —

### MEM-18 · The member's photograph at registration ✅

**Question.** (Raised by Mr Timothy.) Where is the member's photograph taken?

**Answer.** **At registration, on the form, and that photograph is the one printed on the
member's ID card.** The API has stored a photograph and printed it on the card since items
05 and 06; no screen offered to take or upload one. Built in roadmap item 41. MEM-14 (what
the photograph must look like) is still open.
**Answered on.** 6 October 2026. **Answered by.** Mr Timothy, Head of Operations, in a
recorded walk-through of the live System, passed on by the project owner on 7 October 2026.
**Recorded at.** PRD §23.16; `plans/41`.

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

### CARD-05 · Official card artwork ⏳ (partly answered)

**Question.** Please supply the official card artwork at print resolution, together with the
Union emblem and wordmark.

**Why it is needed.** Cards must be visually indistinguishable from those already in
circulation. A reconstruction from a photograph will differ in ways members notice.

**Answer (partial).** **The Union emblem itself has been supplied** (`apps/web/public/logo.png`)
and is now embedded on the card, as a faint watermark behind the field area rather than a
sharp badge — its exact size and position on the official card are still unconfirmed, and a
faint mark is forgiving of being wrong about that in a way a prominent one would not be.
**Still outstanding:** the full print-resolution card background/artwork, the Nigerian coat
of arms, and colour values sampled from the official artwork rather than inferred from a
photograph. The template remains marked provisional for these reasons.
**Answered on.** 17 September 2026. **Answered by.** The project owner.
**Recorded at.** `apps/api/src/card/templates/v1-provisional.ts`

### CARD-06 · The motto wording ✅

**Question.** The supplied card shows the motto **twice, worded differently**: the emblem
reads *"Motto: Safety & Unity"* and the header beneath reads *"MOTTO: UNITY & SAFETY"*. The
field specification records *"Safety and Unity"*. Please confirm the exact wording in each
position on the official artwork.

**Why it is needed.** Both orderings appear on the same physical card. This is to be
reproduced, not corrected — a template that "fixes" one of them would differ visibly from
the article members hold.

**Answer.** **"Safety and Unity."** One official wording, printed consistently — not the two
different orderings the source photograph showed. `v1-provisional.STRINGS.mottoValue` is now
`SAFETY AND UNITY`.
**Answered on.** 17 September 2026. **Answered by.** The project owner.
**Recorded at.** `apps/api/src/card/templates/v1-provisional.ts`

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
(the previous operator's own web address), in two observed forms:

```text
https://<the previous operator's address>/v/status1772628860933
https://<the previous operator's address>/v/status/1772628860933
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

### VEH-13 · Unattached legacy stickers, paid onboarding, and what counts as a vehicle ✅

**Answer — direction as relayed.**

1. Every legacy sticker is **unattached**. A vehicle that has not been re-onboarded does not
   count as declared at all.
2. Stickers are reattached through the System. Nobody may be able to generate a barcode and
   attach it. Legacy stickers cannot be told apart from fabricated ones by looking at
   them.
3. The vehicle owner (a member) pays to have the sticker reattached, and that payment and
   reattachment together **are** the onboarding.
4. There are three separate counts. **On record** includes legacy vehicles. **Onboarded**
   means a sticker is attached. **Declared** means a holder of `vehicle.declare` has marked
   the vehicle declared. Only vehicles that are **both onboarded and declared** count in the
   total shared externally, and no external response says anything about declared status.
5. A vehicle receives a printable, downloadable letter on registration (VEH-19).

**Supersedes in part.** CARD-03 and PRD §26.4 said legacy barcodes resolve as fully
equivalent. Under this direction, a legacy barcode resolves only after it has been
reattached. Item 07's rule that creating the record *is* the declaration no longer holds:
the record, onboarding, and declaration are now separate. VEH-12 still stands; payment is
added to it.

**Controls on reattachment**, confirmed by the owner on 22 September 2026:

- **Allow-list.** Only barcodes on the imported legacy register can be attached. At
  launch that is the 2,408 in the export. Any other barcode is refused and recorded as
  unknown. It is not called a forgery, because the previous operator still issues stickers (VEH-15).
- **One-shot.** Each barcode attaches once. A second attempt is refused and flagged.
- **Plate-bound.** The register ties each barcode to exactly one plate, and there is no
  override (VEH-16).
- **Paid.** Nothing is attached without a payment Paystack has confirmed, and each payment
  reference is used once.

**Answered on.** 22 September 2026. **Answered by.** Relayed by the project owner from a
conversation with NURTW; the Union official is to be named (PAY-09).
**Recorded at.** PRD §2.3 (revision 1.2), §9A, §13, §23.19, §26.4.

### VEH-14 · Is the legacy security code printed on the sticker? ✅

**Question.** The export holds a 5-character `security_code` against nearly every barcoded
vehicle, and it cannot be derived from the barcode. Is it printed on the physical legacy
sticker, either visibly or under a scratch panel?

**Answer.** **No.** The code comes from the previous operator and does not appear on the sticker. It is
adopted as an imported record only and plays no part in reattachment or verification.
Nothing printed on a legacy sticker distinguishes a genuine one from a copy, so the
controls in PRD §9A carry the whole load.
**Answered on.** 22 September 2026. **Answered by.** Project owner.
**Recorded at.** PRD §9A (Requirement 9A.5), §23.19.

### VEH-15 · Is the previous operator still issuing stickers? ✅

**Question.** Can the previous operator still issue or print stickers, and does unissued legacy stock
exist anywhere?

**Answer.** **No — the previous operator has stopped.** The owner first said the previous operator was still issuing,
then clarified the same day. The previous operator generates no more stickers. NURTW holds a few printed
legacy stickers with no softcopy record, and those are the last of them. None carries the
security code.
**Answered on.** 22 September 2026. **Answered by.** Project owner.
**Recorded at.** PRD §23.19.

### VEH-16 · A legacy barcode presented against a different plate ✅

**Question.** The export records which plate each barcode was issued to. If someone presents
a barcode for a different plate, because the plate changed or the sticker was recorded
wrongly, should the System refuse it outright, or allow a named officer to override with a
recorded reason?

**Answer.** **Refuse. There is no override.** The refusal is audited with its reason.
**Answered on.** 22 September 2026. **Answered by.** Project owner.
**Recorded at.** PRD §9A (Requirement 9A.4), §23.19.

### VEH-17 · Legacy stickers in the field before reattachment ✅

**Question.** From go-live, a legacy sticker that has not been reattached will not verify
as a match. On day one, almost every vehicle will therefore scan as not found. Is there a
grace period? What should an officer see?

**Answer.** **No grace period; not found is acceptable.** The result should tell the officer
that the sticker is genuine but not attached.

**Applied as.** This is shown on the internal channels only (dashboard and officer portal).
The copy reads *"Recognised sticker — not attached"*, followed by the plate the
register records for it. The System can confirm that a barcode is on the legacy register and
which plate it was issued for. It cannot confirm that the physical sticker is genuine,
because a copy of a real sticker scans identically (VEH-14). Showing the recorded plate lets
the officer catch a copy on the wrong vehicle. External callers and the public page get the
generic not-found: telling an outside party that a barcode is on the register is the
enumeration signal CLAUDE.md rule 7 forbids. Both points were raised with the owner on
22 September 2026.
**Answered on.** 22 September 2026. **Answered by.** Project owner.
**Recorded at.** PRD Requirement 11.2, §23.19.

### VEH-18 · Order and authority of onboarding and declaration ✅

**Question.** Must a vehicle be onboarded before it can be declared, or can either come
first? Who reattaches the sticker in the field, and is that a different person from whoever
declares the vehicle?

**Proposed.** Either can come first; the vehicle counts only once both are true.
Reattachment sits under a new permission, `sticker.attach`, which field officers can hold.
`vehicle.declare` stays exactly as VEH-04 settled it.

**Answer.** **Either order; a vehicle counts only once both are true.** Attaching a sticker
sits under a new permission, `sticker.attach`, which field officers can hold.
`vehicle.declare` stays exactly as VEH-04 settled it.
**Answered on.** 22 September 2026. **Answered by.** Project owner, adopting the recommendation (“use a recommendation for the others, do not ask me again”).
**Recorded at.** PRD Requirement 9A.2.

### VEH-19 · The vehicle registration letter ✅

**Question.** What does the letter say, who signs it, and on what letterhead? When is it
produced: on onboarding, on declaration, or only once both are true? Should it carry a QR
code? A sample of any letter already in use is the most useful answer.

**Why it is needed.** The letter must not read as a certificate of ownership or of
registration (PRD §4, Requirement 11.1). It will be a versioned template, like the card, so
its wording can change later without invalidating letters already issued.

**Answer.** Adopted recommendation:

- **Trigger.** Produced when the vehicle is **onboarded** (paid, with a sticker attached),
  and downloadable from the vehicle's page at any time afterwards.
- **Content.** The Union's name and emblem, a letter reference number, the date, the plate
  number, the vehicle category, make, model and colour, the sticker number, the member's
  name and membership number, and the unit. Standard wording confirms that the vehicle is
  recorded with NURTW Anambra State Council, followed by the Requirement 11.1 statement
  that this is not evidence of ownership, roadworthiness, licensing, or insurance.
- **Signatories.** The State Chairman and the Secretary, from the same stored signature
  assets as the card (CARD-07). The lines stay blank until those assets are supplied.
- **No QR code.** A QR code carrying the sticker's payload on paper could be photocopied
  onto a fake sticker, which would defeat the destructible substrate (PRD §26.4). The
  letter reference number is looked up internally instead.
- **Template** `v1`, versioned like the card.
**Answered on.** 22 September 2026. **Answered by.** Project owner, adopting the recommendation (“use a recommendation for the others, do not ask me again”).
**Recorded at.** PRD Requirement 9A.6.

### VEH-20 · Onboarding a vehicle that has no legacy sticker ✅

**Question.** Onboarding happens in one of two ways:

- **Reattachment.** The vehicle already carries a legacy sticker on the register. The
  owner pays, and the officer attaches that existing sticker. Nothing new is printed.
- **New sticker.** The vehicle has no usable legacy sticker. That covers brand-new
  vehicles, the 433 in the export with no barcode, and any vehicle carrying one of the
  unrecorded printed stickers (VEH-21). The owner pays, and a new NURTW sticker is printed
  and attached.

Should the second cost the same as the first, or more, given that a sticker is printed?

**Note.** The two are separate fee types, `STICKER_REATTACHMENT` and `STICKER_NEW`, which
start at the same placeholder amount (PRD Requirement 27.1). The answer is a settings
change and blocks no development.

**Answer.** **The same: ₦2,000 for both** a reattachment and a new sticker. They stay
separate fee types, so the two can be priced differently later without development.
**Answered on.** 22 September 2026. **Answered by.** Project owner.
**Recorded at.** PRD Requirement 27.2.

**Paused, 3 October 2026.** No new NURTW stickers for now (the project owner). The
onboarding screen offered reattachment only. The signed-sticker path stays built, behind
one flag, and the System cannot yet print a signed sticker in any case. Since 5 October
2026 a vehicle may be given a printed sticker from stock instead: see VEH-29.

### VEH-21 · Refreshing the legacy register ✅

**Question.** Only barcodes on the imported register can be reattached. How would barcodes
issued after the export get onto it?

**Answer.** **They don't need to. The register is closed.** The previous operator has stopped issuing
(VEH-15), so the export's 2,408 barcodes are the complete register, and nothing is ever
added after the migration. The few printed legacy stickers NURTW still holds have no
digital record. They are not on the register and **can never be attached**. A vehicle that
would have received one gets a new signed NURTW sticker instead.

**Recommended.** Retire or destroy that printed stock. The System refuses those barcodes
anyway, but a stack of genuine-looking legacy stickers is useful to nobody except someone
trying to pass one off in the field.
**Answered on.** 22 September 2026. **Answered by.** Project owner.
**Recorded at.** PRD Requirement 9A.4, §23.19, §26.4.

**Revised.** On 5 October 2026 the owner took up VEH-29: printed stickers the register
never recorded are added to **stock** by scanning them. No import adds to the register
itself, which is what this answer was about, and that still holds.

### VEH-22 · What a positive verification requires ✅

**Question.** Only vehicles that are both onboarded and declared count in the external total
(VEH-13). Should a plate or QR verification likewise return a match only when both are true?

**Proposed.** Yes, for the external API and the public page. Otherwise a vehicle could
verify as a match to an outside organisation while being excluded from the total that same
organisation is shown. The internal channels show every state (on record, onboarded,
declared, dues) whatever the answer.

**Answer.** **Yes.** The external API and the public page return a match only for a vehicle
that is both onboarded and declared. The internal channels show every state.
**Answered on.** 22 September 2026. **Answered by.** Project owner, adopting the recommendation (“use a recommendation for the others, do not ask me again”).
**Recorded at.** PRD Requirement 9A.1.

**Amended.** 3 October 2026 by VEH-28: the internal channels show a vehicle's declaration
status only to holders of `vehicle.declare`.

### VEH-23 · How enumerators add vehicles in the field ✅

**Question.** (Raised on a call between the project owner and Mr Timothy.) Enumerators
register vehicles in the field. At present only a holder of `vehicle.declare` can create a
vehicle at all, because creating one is declaring it, and that permission belongs to the
super administrator and to named grantees alone (VEH-04). How should enumerators add
vehicles?

**Context.** The reference system discussed on the call (a commercial-vehicle registration
portal) has enumerators capture the vehicle and a separate login generate its number, so
that enumerators can be checked.

**Answer.** **A new permission, `vehicle.record`.** It adds a vehicle **on record** only.
A recorded vehicle counts for nothing externally until a holder of `vehicle.declare`
declares it and a sticker is attached. Declaring stays exactly as VEH-04 settled it.
Declaring a vehicle already on record updates that same record rather than creating a
second one (`ARCHITECTURE.md` Decision 6.5).

**Consequence.** No route exists yet to compose a custom role, so a twelfth system role,
**Field enumerator**, bundles what an enumerator needs: registering a member and recording
a vehicle, within their assigned scope. It holds neither `vehicle.declare` nor
`sticker.attach`.
**Answered on.** 26 September 2026. **Answered by.** Project owner.
**Recorded at.** PRD Requirement 9.7, §16, §23.21.

### VEH-24 · Adding a vehicle while the member's application is pending ✅

**Question.** In the new registration flow, an enumerator saves a member and goes straight
to "Add vehicle" for that member, or skips it for a member with no vehicle (leaders who do
not drive, for example). A new member stays pending until an officer approves the
application. Can the vehicle be added while the member is still pending?

**Answer.** **Yes.** Both are recorded in one sitting and the vehicle stays linked to the
applicant. The vehicle is on record only, so nothing counts externally until approval,
onboarding, and declaration have all happened. If the application is refused, the vehicle
stays on record and the link shows the refused applicant.
**Answered on.** 26 September 2026. **Answered by.** Project owner.
**Recorded at.** PRD Requirement 9.10, §23.21.

### VEH-25 · Vehicle owner details ✅

**Question.** (Raised on the same call.) The driver is the member. The vehicle's owner may
not be a member, and only the owner's name, address, and phone are needed. Which owner
details should be recorded?

**Answer.** **Owner name and phone are required on every new vehicle; the address is
optional.** They are held apart from the vehicle record like other sensitive data and are
never reachable through any verification path. For legacy vehicles, the owner details in
the export are copied across exactly as recorded, gaps included.
**Answered on.** 26 September 2026. **Answered by.** Project owner.
**Recorded at.** PRD Requirement 9.8, §23.21, Requirement 25.4.

### VEH-26 · Route type and vehicle type ✅

**Question.** (Raised on the same call.) Vehicles are counted by how they operate:
interstate, intercity, or town service. How should that be captured?

**Answer.** **Route type is required on every new vehicle**, chosen from interstate,
intercity, and town service. No free-text route is recorded. **Vehicle type** (bus, keke,
truck, and so on) is a dropdown, and new types can be added. This is the existing vehicle
category list, which is already administrable master data.

**Consequences.**

- Route type is a list the Union administers, like vehicle categories, because the levy is
  priced by it (PAY-14).
- Legacy vehicles import with no route type. Nothing is inferred from the old
  `BUS_INTERSTATE`/`BUS_INTRASTATE` categories.
- A vehicle cannot be onboarded until it has a route type, because its levy starts the
  month after onboarding and cannot be priced without one.
**Answered on.** 26 September 2026. **Answered by.** Project owner.
**Recorded at.** PRD Requirement 9.9, 9A.2, §23.21.

### VEH-27 · Reissuing the vehicle letter when its details change ✅

**Question.** The vehicle letter (VEH-19) is produced at onboarding and prints the member's
name and membership number and the unit as they stand at that moment. Most legacy vehicles
have no driver linked yet: 2,761 of the 2,841 in the export. A letter produced for one of
them prints "Not recorded" in place of the member. If a driver is linked later, or the
vehicle moves to another unit, should an officer be able to reissue the letter?

**Why it matters.** Like the card, a letter is a document someone carries. Rewriting the
one already issued would produce a different letter bearing the same reference. Item 18
therefore keeps each letter exactly as printed.

**Recommended.** Allow a reissue by an officer holding `sticker.attach`, with a recorded
reason. The new letter gets a new reference, the old one is kept and marked superseded,
and only the latest can be downloaded.

**Answer.** **As recommended.** An officer holding `sticker.attach` over the vehicle may
reissue the letter, giving a reason. The new letter is a fresh snapshot under a new
reference; the old one is kept as printed, marked superseded, and no longer downloads.
**Answered on.** 3 October 2026. **Answered by.** Project owner, adopting the
recommendation. **Recorded at.** PRD Requirement 9A.6, §23.22. Built as item 26.

### VEH-28 · Who may see a vehicle's declaration status ✅

**Question.** The internal verification screen (item 10) showed every state behind a
negative result, including whether the vehicle is declared. Officers at the roadside use it,
and a driver can see their screen. Who should see a vehicle's declaration status?

**Answer.** **Only those who hold the permission to declare a vehicle** (`vehicle.declare`),
which is the super administrator and those expressly granted it. It is never public.
**Answered on.** 3 October 2026. **Answered by.** Project owner.
**Recorded at.** PRD Requirement 9A.1, §23.22.

**Applied as.** A vehicle's declaration status and declaration date reach a response only
for a caller holding `vehicle.declare` over that vehicle, on every screen and route:

- The vehicle list, the vehicle's page, the registration flow, and the Verify screen.
- On the Verify screen, anyone else is told that the vehicle's record is not complete,
  never that it is undeclared. The audit trail keeps the true reasons.
- A status filter matches only vehicles whose status the caller may see, and the vehicle
  list no longer orders declared vehicles first.
- Suspending, reinstating, retiring, or dismissing a dispute changes a declaration status,
  and the answer to such a request would reveal it, so those acts now need `vehicle.declare`
  as well as their own permission.

Outside the Union nothing changes: Requirement 12.7 already keeps declaration out of every
external response.

### VEH-29 · Adding unrecorded printed stickers by scanning them ✅

**Direction.** The Union holds printed stickers it can use, but they are not on the
register. It wants to add them to the System by scanning them, and then attach them to
vehicles. First given by the project owner on 3 October 2026 as "not now, later", and taken
up on 5 October 2026: "I can't see where to add those stickers."

**Why it needed care.** A legacy barcode is a millisecond timestamp with no proof of
authenticity (PRD §26.4). Before this, a fabricated barcode failed because it was not on the
register. Once barcodes can be added by scanning, that control moves to whoever may add
them.

**Answer.**

1. **Who may add one: the owner, and those the owner grants.** A new permission,
   `sticker.stock_intake`, in no role, like `vehicle.declare`. Chosen by the project owner
   on 5 October 2026 over giving it to every officer who can attach a sticker.
2. **No list to check against.** The stickers have no digital record anywhere (VEH-15), so
   a scan is checked only for its shape and for not being held already.
3. **Bound to a plate on attachment.** A sticker in stock belongs to no vehicle.
4. **The PRD is revised** (1.12): Requirements 9A.4 and 9A.8, §23.19, and §26.4.

**Answered on.** 5 October 2026. **Answered by.** Project owner. **Recorded at.** PRD
Requirements 9A.4 and 9A.8 (revision 1.12).

**Built as (item 27), with the choices the project made:**

- **A stock sticker is paid for as a new sticker** (`STICKER_NEW`); the reattachment fee
  stays for the sticker a vehicle already carries. Both are ₦2,000 today, and each is a
  setting.
- **Withdrawing.** A sticker lost, damaged, or added by mistake is withdrawn with a reason.
  It is final, and nothing is deleted.
- **A vehicle the register knows may take a stock sticker instead**, when its own is lost
  or damaged. The officer chooses, and the fee follows the choice.
- **Whether a second officer confirms stock is not settled:** see VEH-32. Nothing of the
  kind is built.

### VEH-30 · Making sticker assignment obvious ✅

**Direction.** Assigning a sticker was hard to find. A vehicle without one should say so in
a banner whenever it is viewed, and adding a vehicle should end on a prompt to buy its
sticker, which can be closed. Given by the project owner on 5 October 2026; roadmap item 35.

**Question.** While new NURTW stickers are paused (VEH-20) and the register is closed
(VEH-21), what do the banner and the prompt do for a vehicle the legacy register holds no
barcode for?

**Answer.** **Say so, and charge nothing.** They say the vehicle has no sticker yet and that
new NURTW stickers are not being issued, and no payment is offered until they are. A vehicle
whose legacy sticker is on the register gets the full prompt: pay the fee, then reattach
(Requirement 9A.4).

**Answered on.** 5 October 2026. **Answered by.** Project owner, adopting the
recommendation. **Recorded at.** PRD Requirement 9A.7 (revision 1.11).

**Built as (item 35), with the choices the project made:**

- **The prompt appears after "finish"**, both on Vehicles → New and at the end of a
  registration's vehicle step, never after "add another". A registration's list of vehicles
  added offers "Assign sticker" against each.
- **It is shown only to an officer who can attach a sticker.** Anyone else sees the banner,
  which says who can.
- **The onboarding panel moved up**, under the vehicle's details, where the banner's button
  leads.

**Revised** on 5 October 2026 by VEH-29 and VEH-31: a vehicle may now be given a sticker
from stock, so "nothing to give" means that stock is empty too; and the order is pay, then
scan.

### VEH-31 · The order of assigning a sticker: pay, then scan ✅

**Direction.** "When I click on assign sticker, I am supposed to be able to pay for the
sticker or check if I have already paid for a sticker, then open a QR code scanner to scan
the QR code and get the barcode id. Only when payment is confirmed." Given by the project
owner on 5 October 2026. Before it, the panel asked for the barcode first, typed by hand,
and had no camera.

**Answer.** **Payment first, then the camera.**

1. The officer takes the sticker fee, or the System finds a confirmed payment already made
   for the vehicle and not yet used.
2. Once the payment is confirmed, the camera opens and reads the sticker's QR code. The
   number can be typed where no camera can be used.
3. The System says what that sticker can be for this vehicle, and the officer confirms.

**Answered on.** 5 October 2026. **Answered by.** Project owner. **Recorded at.** PRD
Requirement 9A.7 (revision 1.12).

**Built as (item 27), with the choices the project made:**

- **The sticker fee goes wholly to the contractor's Paystack account**, as the owner said
  it should. That was already so: both sticker fees settle to the main account alone, with
  no share to the NURTW settlement account, so taking one needs no settlement account
  (Requirement 27.4).
- **No waiting on the webhook.** Coming back from Paystack, or pressing "Already paid?
  Check", asks Paystack about the vehicle's open payments (`POST /payments/check`). A check
  only ever confirms: a payment the payer has not finished is left open.
- **The payer may pay on their own phone**, from a QR code of the payment page, or on the
  officer's device.
- **A legacy sticker's QR code holds a web address ending in its barcode** (VEH-13). The
  System takes the barcode from it, on every channel, so an address is never mistaken for a
  forged signed code.
- **The camera is also on the Verify screen**, and reads straight into a check.

### VEH-32 · Should a second officer confirm stickers added to stock? ⏳

**Question.** A sticker's code proves nothing by itself, so whoever adds stock decides which
stickers count (VEH-29). Should a second officer have to confirm each batch before it can be
attached, or is the audit trail enough?

**Status.** Not asked of the owner yet. Nothing of the kind is built: one holder of
`sticker.stock_intake` adds a sticker, and it is in stock at once. Every addition is audited
with the officer who made it.

### VEH-33 · The order of the vehicle form ✅

**Question.** (Raised by Mr Timothy, going through the live form.) In what order should a
vehicle's details be asked?

**Answer.** **Plate number, then chassis number, then the other vehicle details** (type,
make and model, colour), **then the route, then the branch.** The branch was second and the
chassis number last.
**Answered on.** 6 October 2026. **Answered by.** Mr Timothy, Head of Operations, in a
recorded walk-through of the live System, passed on by the project owner on 7 October 2026.
**Recorded at.** `plans/41`. A change to the screen only.

### VEH-34 · Is the chassis number compulsory? ✅

**Question.** (Raised by Mr Timothy.) The chassis number has been optional. Must it be given?

**Answer.** **Yes.** The plate number and the chassis number are "the very, very
compulsory" two.

**Consequences.**

- A new vehicle is refused without a chassis number. The column stays nullable, because
  legacy vehicles lawfully lack one, as with the route type and the owner (VEH-25, VEH-26).
- The chassis number stays restricted: it is still in no list, no verification, and no log.
- It changes PRD §9. Planned in `plans/43`, and not built until that is approved.
**Answered on.** 6 October 2026. **Answered by.** Mr Timothy, Head of Operations, in a
recorded walk-through of the live System, passed on by the project owner on 7 October 2026.
**Recorded at.** — (PRD §9 is revised when `plans/43` is built.)

### VEH-35 · A complete route: from where, to where ⏳ (partly answered)

**Question.** (Raised by Mr Timothy.) VEH-26 records only the route type. What else should a
vehicle's route say?

**Answer (partial).** "A complete route is … from your departure point to your destination
point." By route type:

- **Interstate:** the town and local government area in Anambra it leaves from, and the
  **state** it goes to. Not the town or local government area in that state.
- **Intercity:** the local government area and town it leaves from, and the local
  government area and town it goes to, both in Anambra. The two may be in the same local
  government area, where they are different towns.
- **Town service:** a departure point and a destination point.

This **revises VEH-26**, which said no free-text route is recorded.

**Still outstanding:**

- He described intercity as "between two different, two different or four local
  governments". What "four" means is not clear from the recording.
- Whether a town and a point are typed in or chosen from a list (ORG-07).
- Whether the route is required on every new vehicle, and whether legacy vehicles need one.
- Whether the route prints on the vehicle letter.

Nothing is stored for a route beyond its type today, so this needs new data. Planned in
`plans/43`. Place names in the recording were transcribed by machine and are not relied on.
**Answered on.** 6 October 2026. **Answered by.** Mr Timothy, Head of Operations, in a
recorded walk-through of the live System, passed on by the project owner on 7 October 2026.
**Recorded at.** —

---

## 8. Open — legacy migration (item 09)

### MIG-04 · Reconciling legacy vehicle owners to members ✅

**Question.** The export holds owner details denormalised inside `owner_jsonb` on each
vehicle, plus a separate `drivers.csv` of 81 drivers. How should these become member records
— is the vehicle owner a member, the driver a member, or both?

**Why it is needed.** It determines how many members the migration creates and which of them
receive cards. The interim position is to import as recorded and reconcile afterwards, which
is safe but leaves work for staff.

**Answer.** **The driver is the member; the owner is not made one.** Each `drivers.csv` row
becomes a member, as item 09 already does. The owner in `owner_jsonb` becomes the vehicle's
owner details (VEH-25), copied exactly as recorded, and no member record is created for
them. An owner who is also a member is linked by staff afterwards, never by name matching.
**Answered on.** 26 September 2026. **Answered by.** Project owner, following a call with
Mr Timothy.
**Recorded at.** PRD Requirement 25.4, §23.21.

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

### MIG-07 · When and where the legacy import runs ✅

**Question.** The import script (item 09) is ready but has never been run. Owner details
are being added (VEH-25). When should it run, and against which database?

**Answer.** **After the owner fields exist, so that one import carries the owner details
across. It runs first against a local database, and the reconciliation report goes to the
project owner.** It runs against the shared Neon database only once the project owner has
read that report.
**Answered on.** 26 September 2026. **Answered by.** Project owner.
**Recorded at.** `plans/09-legacy-data-migration.md`.

---

## 9. Open — external organisations (items 11–12)

### EXT-05 · First organisations to onboard ⏳ (partly answered)

**Question.** Which specific organisations should be onboarded first, and who is the named
technical contact at each?

**Why it is needed.** PRD §23.10 determined all four classes are eligible *subject to
individual approval*. This asks for the individuals.

**Answer (partial).** **One pilot, after go-live.** No outside organisation is onboarded
before go-live. The first is a single pilot; others follow once it has run cleanly for a
while. **Still outstanding: which organisation is the pilot, and its contact's role.** The
contact's telephone and email go into the System when it is registered, not into this
register.
**Answered on.** 5 October 2026. **Answered by.** Project owner, adopting the
recommendation. **Recorded at.** PRD §23.10.

### EXT-06 · Who approves an external organisation ✅

**Question.** Which Union officer approves an external organisation's access and signs the
data-sharing terms?

**Answer.** **The API administrator, and the super administrator: whoever holds
`api_client.manage`.** One officer may both register and approve an organisation, and the
approving officer is recorded with the time. Who signs the agreement itself for the Union
is the Union's own matter; the System records its reference and date (EXT-07).
**Answered on.** 3 October 2026. **Answered by.** Project owner, adopting the
recommendation. **Recorded at.** PRD Requirement 12.9, §23.23.

### EXT-07 · Data-sharing agreement ✅

**Question.** Does the Union have a data-sharing agreement or terms of use for external
organisations? If not, one is required before any external credential is issued.

**Why it is needed.** Every external credential discloses members' personal data to a third
party. The lawful basis and the recipient's obligations must be documented before, not
after.

**Answer.** **Required.** The approving officer records the agreement's reference and the
date it was signed. An organisation without one cannot be approved, and no token is issued
to it. The agreement is drafted and signed outside the System, so none can be approved
until the Union has one.
**Answered on.** 3 October 2026. **Answered by.** Project owner, adopting the
recommendation. **Recorded at.** PRD Requirement 12.8, §23.23.

### EXT-08 · Withdrawal of access ✅

**Question.** On what grounds is an external organisation's access withdrawn, and who
decides? Is there a notice period?

**Answer.** **At once for cause; with notice otherwise.** For misuse, a token suspected of
leaking, or a breach of the data-sharing agreement, the API administrator suspends the
organisation at once, without notice, and records the reason. Access ended for no fault
takes 30 days' written notice, which the data-sharing agreement states. Revocation is final:
a revoked organisation comes back only by being registered and approved again.
**Answered on.** 5 October 2026. **Answered by.** Project owner, adopting the
recommendation. **Recorded at.** PRD §23.23.

### EXT-09 · Public verification page presentation ⏳

**Question.** Should the public verification page carry Union branding and a contact
number for disputing a result?

**Note.** PRD §23.13 determined the page is reachable **by QR scan only** — there is no form
to type into and no enumerable parameter. This concerns only what the resulting page shows.

**Answer.** _Outstanding._
**Answered on.** — **Answered by.** — **Recorded at.** —

### EXT-10 · How a token-expiry reminder reaches the organisation ✅

**Question.** PRD Requirement 12.6 asks for advance reminders before a token expires. The
System cannot send email yet. How should reminders work until it can?

**Answer.** **On the dashboard.** The API access screen flags a token from 14 days before it
expires (the `api_token.reminder_days` setting), and the administrator contacts the
organisation. Emailed reminders follow once a mail service and the domains (GOV-08) are
chosen.
**Answered on.** 3 October 2026. **Answered by.** Project owner, adopting the
recommendation. **Recorded at.** PRD Requirement 12.6, §23.23.

### EXT-11 · How long a replaced token keeps working ✅

**Question.** When a token is replaced, should the old one stop at once, or keep working for
a while so the organisation can install the new one without an outage?

**Answer.** **The officer chooses at each rotation:** at once, one hour, 24 hours, or seven
days, and never beyond the old token's own expiry. A token that may have leaked is revoked
instead, which is immediate.
**Answered on.** 3 October 2026. **Answered by.** Project owner, adopting the
recommendation. **Recorded at.** PRD Requirement 12.10, §23.23.

### EXT-12 · A test environment for outside organisations ✅

**Question.** Proposal §12.1 lists "approved environments, such as test and production" for
each client. Should organisations get a separate test environment, with test tokens and
synthetic records, to build against before they touch real data?

**Why it is needed.** Without one, an organisation's first request is against members' real
records. A test environment means a second deployment with its own database, which has a
hosting cost.

**Answer.** **Production only.** No separate test environment. Item 11's production tokens
stand, and an organisation's first request is against real records. The approving officer
can still start an organisation on a narrow disclosure profile and a low daily quota.
**Answered on.** 5 October 2026. **Answered by.** Project owner. **Recorded at.** PRD
§23.23.

### EXT-13 · Whether an outside membership check may carry the holder's name ✅

**Question.** An outside organisation's membership check confirms that a card or membership
number is valid. It cannot show whether the person presenting the card is its holder,
because proposal §15's Membership verification profile carries no name or photograph. Should
a profile the Union composes ever be allowed to carry the holder's name?

**Why it is needed.** Internally the name is shown, because comparing it with the card is
how a genuine number copied onto someone else's card is caught. Externally the System
follows the proposal and discloses no name. Allowing it would mean a PRD revision, since the
name is personal data and is today held back from every outside party.

**Answer.** **No name, ever.** No profile, seeded or composed, may carry the holder's name or
photograph to an outside party. An outside membership check confirms only that the number
is valid; its limitation already says it "does not establish identity beyond what the Union
has recorded". Item 12 stands unchanged.
**Answered on.** 5 October 2026. **Answered by.** Project owner, adopting the
recommendation. **Recorded at.** PRD §23.23.

### EXT-14 · Where the rate-limit counters are kept ✅

**Question.** The limits must hold across restarts and across more than one API instance, so
the counters cannot live in the process (Decision 8.2). Should they be kept in the existing
Postgres database, or in a managed Redis service at a monthly cost?

**Answer.** **Postgres.** No new service. Every counter goes through one service, so moving to
Redis later changes that service alone.
**Answered on.** 3 October 2026. **Answered by.** Project owner, adopting the
recommendation. **Recorded at.** PRD §23.24.

### EXT-15 · The starting daily quota ✅

**Question.** Proposal §14.2 sets per-minute rates and leaves the daily quota as
"NURTW-configured". What should it start at?

**Answer.** **1,000 a day for an approved organisation and 5,000 for a trusted operational
one**, changeable per profile and per organisation. The standard figure is below the size of
the register, so a day's quota cannot walk it.
**Answered on.** 3 October 2026. **Answered by.** Project owner, adopting the
recommendation. **Recorded at.** PRD §23.24.

### EXT-16 · What happens when enumeration is detected ✅

**Question.** When an organisation tests plates or sticker codes in a pattern, should the
System block it automatically, only alert, or suspend it until reviewed?

**Answer.** **Pause it for a time**: an hour to start, a setting on its limit profile. The
pause is flagged on the API access screen, and an API administrator may lift it early, with a
reason, or suspend the organisation.
**Answered on.** 3 October 2026. **Answered by.** Project owner, adopting the
recommendation. **Recorded at.** PRD Requirement 14.4, §23.24.

### EXT-17 · Abuse-detection thresholds ✅

**Question.** Item 13 pauses an organisation that, within ten minutes, sends five forged
sticker codes, or five plates or sticker numbers in sequence that match nothing, or at least
as many non-matches as one minute at its full rate, if they are also 80 per cent of its
checks. Are these the right starting thresholds?

**Why it is needed.** Set too low, an honest integrator is paused; too high, a scraper is not.
They are launch defaults chosen by the project, not figures the Union gave.

**Answer.** **Keep them for launch, and review after the pilot.** After the pilot
organisation's first month (EXT-05), the API administrator reviews any pauses and adjusts the
numbers on the Limits tab. Every threshold is a number on the limit profile, changed without
a release.
**Answered on.** 5 October 2026. **Answered by.** Project owner, adopting the
recommendation. **Recorded at.** PRD §23.24.

### EXT-18 · Guarding totals against subtraction ✅

**Question.** Filtered totals can be subtracted from one another: a branch's total minus its
other units' totals reveals a small unit whose own total was suppressed. How should the
totals guard against that?

**Answer.** **By zone or branch only, never by unit, and every filtered total rounded to the
nearest 10** (the `aggregate.rounding_base` setting). Subtracting then gives only a rough
figure. The grand total stays exact, since it cannot be differenced.
**Answered on.** 4 October 2026. **Answered by.** Project owner, adopting the
recommendation. **Recorded at.** PRD Requirement 13.6, §23.25.

### EXT-19 · Reporting periods ✅

**Question.** Proposal §13.2 allows a date filter "using approved reporting periods". Which
periods?

**Answer.** **A calendar month, quarter, or year**, in Lagos, each counted as at its end, or
now if it has not ended.
**Answered on.** 4 October 2026. **Answered by.** Project owner, adopting the
recommendation. **Recorded at.** PRD Requirement 13.7, §23.25.

### EXT-20 · How an organisation applies for itself ✅

**Direction.** An outside organisation should be able to apply for access by itself, and see
a dashboard of its own usage. The API administrator must still approve it. Given by the
project owner on 5 October 2026; roadmap item 29. Recorded at PRD §23.23.

**Still to decide before item 29 is planned:**

- Who signs in to the portal, and whether those accounts are kept apart from officers'.
- How an applicant's email is confirmed while the System sends no mail (GOV-08).
- What an approved organisation may do there itself: see usage only, or also manage its
  own tokens.
- How the open application form is kept from being flooded.

**Answer.**

- **Separate organisation accounts**, with their own table, sign-in, and cookie. They are
  kept apart from officers' and can never hold an officer permission.
- **The API administrator confirms the applicant** by telephone or letter before approving.
  No email step until a mail service and domain exist (GOV-08); then an emailed confirmation
  is added.
- **Usage and its own tokens.** An approved organisation sees its usage, and creates,
  rotates, and revokes its own tokens. A token is shown once, to the organisation only, so no
  Union officer handles a live one. Scopes, disclosure profile, and limits stay set by the
  administrator.
- **Limits and expiry on the form**: a few applications per address per hour, a cap on
  pending applications, and expiry of an unapproved application after 30 days. A challenge
  service is added only if the form is abused.

**Answered on.** 5 October 2026. **Answered by.** Project owner, adopting the
recommendations. **Recorded at.** PRD §23.23.

**Built as (item 29), with the choices the project made:**

- **One portal account for each organisation.** More than one is left for later.
- **The applicant chooses the portal password when applying.** An account the
  administrator gives, or resets, starts on a temporary password shown once.
- **The form's limits:** 3 applications an hour from one address, and no more while 50
  await a decision. Both are settings.
- **A lapsed application** is kept as a revoked record, and its account is removed so the
  applicant may apply again with the same address.
- **Usage shows counts only**, in the terms the API's own answers used. It does not
  separate a forged code from any other non-match, or say why requests were paused.
- **No second factor for portal accounts yet.** Ten failed sign-ins lock one for fifteen
  minutes, as for officers.

### EXT-21 · Inviting an organisation by a link ✅

**Direction.** The API administrator should be able to share a link for a particular
organisation to apply, from a page of its own for outside organisations. Given by the
project owner on 5 October 2026; roadmap item 33.

**Question.** Is that one general link to the open application form, or a personal link
for each organisation invited?

**Answer.** **A personal link for each invitation.** It names the organisation and opens
the application form with its name filled in. It is used once, expires after a period set
in settings, and can be withdrawn with a reason. The administrator sees who invited each
organisation. The general link to the open form is offered beside it. Confirmation by
telephone or letter, and approval, are unchanged: an invitation confirms nothing and lifts
no limit.

**Answered on.** 5 October 2026. **Answered by.** Project owner, adopting the
recommendation. **Recorded at.** PRD §23.23, Requirement 12.11 (revision 1.10).

**Built as (item 33), with the choices the project made:**

- **A link lasts 14 days**, and its page may be opened 30 times a minute from one address.
  Both are settings.
- **The code is not a credential** (`ARCHITECTURE.md` Decision 9.17), as a pay link's is
  not. It is stored as it is, so the same link can be sent again.
- **A link no longer open says so**, and the organisation may still apply without it. An
  application sent on a closed link is taken uninvited and told nothing different.
- **The System sends nothing.** The administrator sends the link from their own WhatsApp,
  SMS, or mail, or shows its QR code.
- **The contact on an invitation is optional**, and is for the administrator's own use when
  confirming the applicant.

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
stickers. Changing it later invalidates stickers already in the field. Email from the
System (token reminders, EXT-10; an applicant's confirmation, EXT-20) is sent from it too.

**Answer.** _Outstanding._ Put to the project owner on 5 October 2026 and left open. No
signed sticker should be printed until it is answered.
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

### GOV-11 · Go-live date and parallel running ⏳ (partly answered)

**Question.** What is the target go-live date, and will the previous system run in parallel
for a period? If so, which is authoritative during that period?

**Answer (partial).** **No parallel running.** The System is authoritative from the day of
go-live. The previous system is kept read-only for reference for a while, and nothing new is
entered there. **The date is fixed once the gates are met:** item 15 done, the real branches
(ORG-05), the card artwork and signatures (CARD-05, CARD-07), the second factor on (GOV-18),
and the domains (GOV-08). **Still outstanding: the date itself**, which then becomes the
`dues.go_live_date` setting.
**Answered on.** 5 October 2026. **Answered by.** Project owner, adopting the
recommendation. **Recorded at.** PRD §23.27.

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

### GOV-16 · How a new officer gets a first password ✅

**Question.** The System cannot send email yet (GOV-08). How does a new officer, or one whose
password is reset, get a password?

**Answer.** **A temporary password.** The System generates it and shows it once to the
administrator, who passes it on. The officer must choose their own at first sign-in and can
use nothing else until they have.
**Answered on.** 4 October 2026. **Answered by.** Project owner, adopting the
recommendation. **Recorded at.** PRD Requirement 17.3, §23.26.

### GOV-17 · Who must use a second factor ✅

**Question.** PRD Requirement 17.1 requires multi-factor sign-in for "privileged roles" and
names none. Who?

**Answer.** **Anyone using a privileged permission**: managing officers, roles, grants,
settings, limits, outside organisations and their tokens, the settlement account, security
monitoring, and `vehicle.declare`. That covers the super, API, and security administrators
and anyone granted one of those permissions. Other officers sign in with a password, and may
set a second factor up if they wish.
**Answered on.** 4 October 2026. **Answered by.** Project owner, adopting the
recommendation. **Recorded at.** PRD Requirement 17.1, §23.26.

### GOV-18 · When the second-factor requirement is turned on ✅

**Question.** The requirement ships off, so that no administrator is locked out before
setting an authenticator up. When is it turned on?

**Why it is needed.** Requirement 17.1 is not met until it is on. It must be on at go-live.
Turning it on needs each administrator to have enrolled, and the deployment to hold
`MFA_ENCRYPTION_KEY`.

**Answer.** **At go-live, as a gate.** The production API is given `MFA_ENCRYPTION_KEY`,
every administrator enrols, and an administrator turns the requirement on under Officers →
Security before officers begin real work. Go-live is not signed off while it is off.
**Answered on.** 5 October 2026. **Answered by.** Project owner, adopting the
recommendation. **Recorded at.** PRD §23.26.

### GOV-19 · Roles the Union composes ✅

**Question.** Should the Union be able to compose its own roles from the permission list at
launch, or only later?

**Answer.** **At launch.** A composed role may hold any permission except `vehicle.declare`
and `payment.manage_settlement`, which reach an officer only by express grant. The twelve
roles of PRD §16 stay unchangeable.
**Answered on.** 4 October 2026. **Answered by.** Project owner. **Recorded at.** PRD §23.26.

### GOV-20 · Locking audit events in the database ✅

**Question.** The proposal asks for "immutable or tamper-evident audit events". Should the
database itself refuse any change or deletion of an audit event?

**Answer.** **Not yet.** The application never changes or deletes an audit event. A database
lock is left for later.
**Answered on.** 4 October 2026. **Answered by.** Project owner. **Recorded at.** PRD §23.26.

### GOV-21 · Naming the previous operator ✅

**Direction.** "Do not include [the previous operator's] name anywhere in the codebase. Do
not state that some QR codes are from [it]." Given by the project owner on 5 October 2026.

**Answer.** **The previous operator is not named, and a sticker is a sticker.**

- The name is written nowhere in the repository: not in code, a comment, a test, a document,
  a plan, a file name, or a commit message. A test fails if it returns.
- Documents say "legacy barcode", "legacy sticker", "the legacy register", and "the previous
  operator".
- No screen says which scheme a sticker belongs to. The audit trail still records which
  scheme resolved each verification, as PRD §26.4 requires.

**Answered on.** 5 October 2026. **Answered by.** Project owner. **Recorded at.** PRD
§23.19 and Requirement 11.2 (revision 1.12).

**What it does not reach.** Audit events written before 5 October 2026 keep their wording,
because the audit trail is never rewritten. Git history before that date keeps it too.

---

## 11. Payments (direction of 22 September 2026)

The System will take payments through Paystack. This reverses the exclusion of revenue and
levy collection at PRD §2.2. Under §2.3, that requires a Union-approved revision of the PRD
(see PAY-09). PAY-01 records the direction, and the remaining questions cover what is needed
to build it.

**Fee types are data, not code** (project owner, 22 September 2026). Further payment types
will be added over time. A new one is created through administration, with its amount,
recurrence, what it is charged against, and how it splits, and needs no deploy. This follows
the same principle as disclosure profiles.

### PAY-01 · Payments direction ✅

**Answer.**

- NURTW charges two dues: a **yearly membership fee** and a **monthly levy**. The **sticker
  reattachment (onboarding) fee** is a third payment.
- The connected Paystack account belongs to the **contractor**. The sticker fee goes to that
  account in full.
- The membership fee and the levy are **split**. A fixed amount stays with the contractor as
  its fee, and the rest settles to an **NURTW subaccount**.
- Further payment types may be added later.

**Refined by PAY-10.** The contractor's fee is 0.5 per cent capped at ₦200, not a fixed
amount. It is charged to the payer on top of the due, so NURTW settles the full due.

**Answered on.** 22 September 2026. **Answered by.** Relayed by the project owner from a
conversation with NURTW; the Union official is to be named (PAY-09).
**Recorded at.** PRD §2.3 (revision 1.2), §27, §23.20.

### PAY-02 · Amounts ✅

**Question.** What is each of the following: the sticker or onboarding fee, the yearly
membership fee, the monthly levy, and the contractor's fixed amount on each split payment?
Do any of them vary by vehicle category (bus, shuttle, truck, tricycle)?

**Answer.** Launch amounts, set by the owner and editable in settings, with every change
audited:

| Fee | Amount |
|---|---|
| Sticker — reattachment | ₦2,000 |
| Sticker — new | ₦2,000 |
| Monthly levy | ~~₦5,000~~ **₦7,000** per vehicle per month, for every route type until different figures are set (revised 26 September 2026) |
| Yearly membership | ₦30,000 |

These are **not placeholders**, so live charging is permitted. The contractor's fee is
settled at PAY-10.

**Revised 26 September 2026.** The levy is ₦7,000, not ₦5,000, matching what drivers
currently pay (raised on a call with Mr Timothy). It is priced per **route type**, not per
vehicle category (PAY-14).
**Answered on.** 22 September 2026; levy revised 26 September 2026. **Answered by.** Project
owner.
**Recorded at.** PRD Requirement 27.2.

### PAY-03 · What each due is charged against ✅

**Question.** Is the monthly levy charged per vehicle or per member, and is the membership
fee charged per member? Do dues follow calendar months and years, or run from the date of
onboarding?

**Note.** The levy varies by vehicle category (PAY-02), which implies it is charged **per
vehicle**. That is the working assumption, pending confirmation. The calendar question is
still open.

**Answer.** Adopted recommendation:

- **The levy** is charged per vehicle, per calendar month. It falls due on the 1st, starting
  with the month **after** the vehicle is onboarded, with no proration.
- **The membership fee** is charged per member and covers **12 months from the date it is
  paid**, matching the card's twelve-month validity (CARD-04). It first falls due on
  approval, or on the go-live date for a member migrated before it.
**Answered on.** 22 September 2026. **Answered by.** Project owner, adopting the recommendation (“use a recommendation for the others, do not ask me again”).
**Recorded at.** PRD Requirement 27.13.

### PAY-04 · Arrears and legacy balances ✅

**Question.** Does a member owe levy for months before they were onboarded? The legacy
export holds wallet balances and amounts owed. Should those be honoured, or does everyone
start clean?

**Proposed.** Start clean at onboarding. Legacy wallets stay unmigrated, as MIG-01 decided.

**Answer.** **Everyone starts clean.** Nothing is owed for any period before the dues start
dates in PAY-03. Legacy wallet balances and amounts owed are neither honoured nor migrated
(MIG-01). Unpaid dues accumulate from those start dates onwards.
**Answered on.** 22 September 2026. **Answered by.** Project owner, adopting the recommendation (“use a recommendation for the others, do not ask me again”).
**Recorded at.** PRD Requirement 27.13.

### PAY-05 · What non-payment does ✅

**Question.** If a member falls behind on the membership fee or the levy, does anything
change: card status, sticker status, or the verification result?

**Answer.** **Unpaid dues show on an internal scan or search, and nowhere else.** They never
appear through the external API or the public page; they exist for the System's own users.
They are shown alongside the verification result, not in place of it.

**Card renewal** (adopted recommendation, 22 September 2026). Renewing a card does not
require the membership fee to be paid. The officer issuing the card sees the member's dues
status on the issuance screen instead.
**Answered on.** 22 September 2026. **Answered by.** Project owner.
**Recorded at.** PRD Requirement 27.8, §23.20.

### PAY-06 · How members pay ✅

**Question.** Where does a member pay: a payment link, a self-service member page, a POS
terminal, or a bank transfer?

**Answer.** **Through a dedicated virtual account, or a payment link.** Either way, a payment
counts only once Paystack confirms it, never on the payer's word. PAY-11 covers how
dedicated-account money settles.
**Answered on.** 22 September 2026. **Answered by.** Project owner.
**Recorded at.** PRD Requirement 27.7, §23.20.

### PAY-07 · Paystack fees and the NURTW subaccount ✅

**Question.** On split payments, who bears Paystack's processing fee: the contractor, the
NURTW subaccount, or the payer, on top of the amount? Has the NURTW subaccount already been
created (a code beginning `ACCT_`), or should it be created from NURTW's settlement bank
details?

**Answer.** **The payer bears it.** The processing fee is added on top of the due (PAY-10).
**The NURTW account is added from settings**, not supplied in advance, and **stays editable
after it is set.** The first save creates the Paystack subaccount. Later saves update that
same subaccount in place, so existing dedicated accounts and payment links keep working.
Who may make that change is PAY-13.
**Answered on.** 22 September 2026. **Answered by.** Project owner.
**Recorded at.** PRD Requirement 27.12.

### PAY-08 · Refunds and receipts ✅

**Question.** Who may approve a refund, and in what circumstances? What does a receipt show,
and is it sent by SMS or email, or printed?

**Answer.** Adopted recommendation:

- **Refunds** cover only a failed service, a duplicate payment, or a payment made against the
  wrong member or vehicle.
  - They are made through Paystack's refund API by a holder of a new `payment.refund`
    permission, held by the super administrator alone unless granted.
  - A reason is mandatory, and the refund is recorded as a reversing ledger entry.
  - The due is refunded; the processing fee is not.
- **Receipts** are issued for every confirmed payment as a downloadable PDF. Each shows:
  - a receipt number, the payer, and what was paid for (the due and its period)
  - the due, the processing fee, and the total
  - the Paystack reference and the date

  Paystack's own email receipt goes to the payer where an email address is held. SMS
  receipts are deferred, because no SMS provider is in the stack.
**Answered on.** 22 September 2026. **Answered by.** Project owner, adopting the recommendation (“use a recommendation for the others, do not ask me again”).
**Recorded at.** PRD Requirement 27.14.

### PAY-09 · Who gave the 22 September direction ✅

**Question.** Which Union official gave the direction recorded at VEH-13 and PAY-01, and on
what date?

**Why it is needed.** PRD §2.3 requires any reintroduction of billing to be a revision of
the PRD approved by the Union. That approval must be recorded with a name and a date.

**Answer.** **Revision 1.2 is approved by the project owner**, who relayed the Union's
direction and has directed that the work proceed without further questions. No Union
official is named. The approval stands on the same footing as the determinations of
9 September 2026, which were also the project owner's.
**Answered on.** 22 September 2026. **Answered by.** Project owner.
**Recorded at.** PRD §2.3.

### PAY-10 · The processing fee and the contractor's fee ✅

**Question.** (Volunteered by the owner.) How is the contractor paid on each payment, and
who covers Paystack's charge?

**Answer.** Work out what Paystack will take, add a small contractor fee, and charge the
payer the total. The payment records exactly the due it pays for, with the fee shown as its
own line. **The contractor's fee is 0.5 per cent of the due, capped at ₦200**, matching what
bank-transfer top-ups already charge. The owner's worked figures:

| Due | Payer pays | Fee shown | Paystack takes | Contractor keeps |
|---|---|---|---|---|
| ₦1,000 | ₦1,021 | ₦21 | ₦15.31 | ₦5.68 |
| ₦5,000 | ₦5,204 | ₦204 | ₦178.06 | ₦25.94 |
| ₦10,000 | ₦10,305 | ₦305 | ₦254.57 | ₦50.42 |
| ₦50,000 | ₦51,066 | ₦1,066 | ₦865.99 | ₦200.01 |
| ₦100,000 | ₦101,828 | ₦1,828 | ₦1,627.42 | ₦200.58 |
| ₦500,000 | ₦502,200 | ₦2,200 | ₦2,000.00 | ₦200.00 |

**Reproduced exactly** by this rule, which is PRD Requirement 27.3:

- contractor fee = min(0.5% of the due, ₦200)
- total = the smallest whole naira such that (total − Paystack's fee on the total) is at
  least (due + contractor fee)
- Paystack's local checkout fee is 1.5% + ₦100, with the ₦100 waived below ₦2,500, capped at
  ₦2,000

Rounding up to the whole naira is what leaves the contractor a few kobo over its fee. Every
parameter is a runtime setting, because Paystack changes its pricing.
**Answered on.** 22 September 2026. **Answered by.** Project owner.
**Recorded at.** PRD Requirement 27.3, §23.20.

### PAY-11 · How dedicated-virtual-account money settles ✅

**Question.** With a payment link, the System sets the amount and the split on every payment,
so PAY-10 applies exactly. With a dedicated virtual account, the member sends whatever they
choose, whenever they choose. Paystack can apply only a **fixed** split to such an account.
It cannot apply the ₦200 cap, cannot add the fee on top, and cannot tell a sticker fee (all
to the contractor) from a due (split with NURTW). Which of these should apply?

- **A. Split at Paystack, straight to the NURTW subaccount.** Union money never passes
  through the contractor. Dedicated-account payments follow a fixed percentage rather than
  the exact PAY-10 figures. Sticker fees are then paid by payment link only.
- **B. Settle to the contractor's account.** The System credits the member and pays NURTW's
  share out by Paystack Transfer on a schedule. PAY-10 applies exactly, to any fee type. The
  contractor holds Union money between settlement and payout, which needs the Union's
  written agreement.

**Answer.** **A.** Dedicated-account money splits at Paystack straight to the NURTW
subaccount at a fixed percentage, and the contractor never holds Union funds. **NURTW dues
may be paid by dedicated account or by payment link. A sticker fee is always paid by
payment link.**

**Operational notes.** Dedicated-account pricing must be confirmed from the Paystack
dashboard, because it is priced separately from checkout. Dedicated accounts must also be
enabled on the Paystack business, which is done on request.
**Answered on.** 22 September 2026. **Answered by.** Project owner.
**Recorded at.** PRD Requirement 27.7, §23.20.

**How the percentage is chosen (5 October 2026).** **Paystack's dedicated-account fee rate,
plus 0.5 per cent**, the contractor's share on payment links (PAY-10), without the ₦200 cap,
which Paystack cannot apply here. The figure is set once the owner has read the fee off the
Paystack dashboard and Paystack has enabled dedicated accounts. It is entered by a super
administrator on a Settlement screen (approved the same day), which needs their password and
a reason. Until then the percentage stays unset and no dedicated account is assigned.
**Answered by.** Project owner, adopting the recommendation.

### PAY-12 · Allocating a dedicated-account payment across dues ✅

**Question.** A member sends money to their dedicated account without saying what it is
for. It may cover their membership fee and the levy on several vehicles. Which dues does it
pay first?

**Answer.** **Oldest outstanding due first**, with any remainder held as credit against the
next due to fall, as proposed. The order is a setting.
**Answered on.** 22 September 2026. **Answered by.** Project owner.
**Recorded at.** PRD Requirement 27.7, §23.20.

### PAY-13 · Who may change the NURTW settlement account ✅

**Question.** Changing the NURTW bank account in settings redirects every naira of the
Union's dues (PAY-07). Who may do it? And once the account has first been set, should any
later change need a second administrator to approve it?

**Answer.** **A dedicated permission, held by the super administrator alone unless
expressly granted**, with the password re-entered to make the change, as proposed. **No
second approver.** The control is proper audit logs instead:

- a mandatory reason on every change
- full before and after values (bank, account number, account name, subaccount code)
- actor, IP address, and request id
- failed attempts recorded as well as successful ones
- the change history shown on the settings page itself
**Answered on.** 22 September 2026. **Answered by.** Project owner.
**Recorded at.** PRD Requirement 27.12, §23.20.

### PAY-14 · What sets the levy amount ✅

**Question.** (Raised on a call with Mr Timothy.) The levy can differ by category. Which
category sets it: route type, vehicle type, both, or one flat rate?

**Answer.** **Route type.** Interstate, intercity, and town service each carry their own
levy amount, all starting at ₦7,000 until the Union sets different figures. This replaces
"may vary by vehicle category" in PRD Requirement 27.1. Each amount is an audited setting
with a mandatory reason, like every other amount.
**Answered on.** 26 September 2026. **Answered by.** Project owner.
**Recorded at.** PRD Requirement 27.1, 27.2, §23.20.

### PAY-15 · The processing fee, after the objection that it is too high ✅

**Question.** (Raised on the same call.) Mr Timothy felt the processing fee is too high.
Under Requirement 27.3, a ₦7,000 levy costs the driver ₦7,244: about ₦209 is Paystack's
charge and ₦35 is the contractor's 0.5 per cent. A flat ₦20 on top (₦7,020) was floated,
but it would not cover Paystack's charge, so NURTW would receive less than ₦7,000. What
should apply?

**Answer.** **Keep the rule as it is.** The driver pays ₦7,244 and NURTW receives the full
₦7,000. It is to be revisited once the provider comparison (PAY-16) is in. Every figure is
a setting, so a change needs no release.

**Note.** The call put Paystack's ₦100 waiver below ₦2,000. The rule uses ₦2,500, which
is Paystack's published threshold and the one the owner's worked figures at PAY-10
reproduce. It is a setting either way.
**Answered on.** 26 September 2026. **Answered by.** Project owner.
**Recorded at.** PRD Requirement 27.3 (unchanged).

### PAY-16 · The payment provider ✅

**Question.** (Raised on the same call.) Mr Timothy is comparing Interswitch, Paystack,
and Flutterwave charges. Payments are built on Paystack. What happens meanwhile?

**Answer.** **Keep building on Paystack.** Every provider call sits in one client class,
so switching later touches that class and the webhook, not the ledger, the fee rule, or
the screens. The provider changes only if the comparison shows a material saving for
drivers, and then by a PRD revision.
**Answered on.** 26 September 2026. **Answered by.** Project owner.
**Recorded at.** PRD §23.20.

### PAY-17 · Payment channels for drivers without smartphones ✅

**Question.** (Raised on the same call.) Many drivers use feature phones or pay through POS
agents, and USSD was mentioned. What should be built next?

**Answer.** **The payment link, plus a dedicated account per driver**, as PAY-06 already
set. A dedicated account is an ordinary bank account number, so a POS agent or any banking
app can pay into it without a smartphone or a card. **USSD waits until after launch.**
Dedicated accounts are **already enabled** on the Paystack business (confirmed by the
project owner, 26 September 2026). Their pricing still needs confirming from the Paystack
dashboard (PAY-11).
**Answered on.** 26 September 2026. **Answered by.** Project owner.
**Recorded at.** PRD Requirement 27.7, §23.20.

### PAY-18 · A membership fee paid early, or after a gap ✅

**Question.** The membership fee covers 12 months from the date it is paid (PAY-03). Two
cases follow from that rule and are not settled:

1. **Paid early.** A member covered until 1 June pays again on 1 April. Does the new cover
   run from 1 April, losing two months already paid for, or from 1 June?
2. **Paid after a gap.** A member whose cover lapsed two years ago pays one fee. Do they
   owe one fee, or one for each year missed?

**Built as.** Exactly as PAY-03 reads: cover runs 12 months from each payment date, and at
most one fee is outstanding at a time. An early payment therefore loses the overlap, and a
gap is never billed.

Item 23 adds a third case. Dedicated-account money pays the oldest due first, so part of a
fee can arrive before the rest. The parts are held, and the 12 months start on the day the
whole fee has been received.

**Recommended.** For an early payment, run the new cover from the end of the current one,
so nobody loses what they paid for. For a gap, keep one fee: it matches "12 months from the
date it is paid".

**Answer.** **As recommended.** A fee paid while cover is running adds 12 months to the end
of it. After a lapse, one fee is owed, and its year starts on the day it is paid.
**Answered on.** 3 October 2026. **Answered by.** Project owner, adopting the
recommendation. **Recorded at.** PRD Requirement 27.13, §23.22. Built as item 25.

### PAY-19 · When a levy stops, and a change of route type ✅

**Question.** The levy falls due every month from the month after a vehicle is onboarded
(PAY-03). Two cases are not settled:

1. **Stopping.** Does the levy stop when a vehicle is retired or sold, or when its sticker
   is lost or cancelled? Nothing says it does.
2. **A change of route type.** The levy is priced by route type (PAY-14). If a vehicle
   moves from town service to interstate, are its unpaid earlier months charged at the old
   route type's amount or the new one's?

**Built as.** The levy never stops by itself. Every month is priced at the route type the
vehicle has now, using the amount that was in force for that route type on the 1st of the
month. All three route types cost the same today, so the second case changes nothing yet.

**Recommended.** Stop the levy from the month after a vehicle is retired, and keep each
month at the route type the vehicle had on the 1st of that month.

**Answer.** **As recommended.** The month a vehicle is retired in is still due; nothing
falls due after it. Each month is priced at the route type the vehicle had on its 1st.
**Answered on.** 3 October 2026. **Answered by.** Project owner, adopting the
recommendation. **Recorded at.** PRD Requirement 27.13, §23.22. Built as item 25: the
retirement date and every route type a vehicle has had are now recorded.

### PAY-20 · If Paystack asks for a member's BVN before opening a dedicated account ✅

**Question.** Paystack can require a customer's identity to be checked before it opens a
dedicated account, using their BVN or their own bank account number. Whether it does depends
on how the Union's Paystack business is set up, which only the dashboard or a first test
shows. If it does, may the System ask members for their BVN, or a bank account number, and
pass it to Paystack?

**Why it is needed.** A BVN is among the most sensitive identifiers a Nigerian holds. The
System collects none today, and adding one is a data-protection decision for the Union, not
a technical one. Nothing in PRD §27 provides for it.

**Built as.** No BVN is collected. Paystack is sent only the email, names, and phone
(Requirement 27.7). If Paystack refuses to open an account for want of identification, the
refusal is audited and the officer is told Paystack did not open it.

**Recommended.** Check first, with a test-mode account and then one live account. Only if
Paystack refuses, collect the BVN at the moment of assignment, pass it straight to Paystack,
and do not store it.

**Answer.** **As recommended.** Nothing is built until the test shows Paystack requires it;
if it does, the BVN is asked for at assignment, passed straight to Paystack, and never
stored or logged.
**Answered on.** 3 October 2026. **Answered by.** Project owner, adopting the
recommendation. **Recorded at.** PRD §23.22.

**The member's bank account number (5 October 2026).** If Paystack's check also wants the
member's own bank account number, **the same rule applies**: asked only at assignment and
only if Paystack requires it, passed straight to Paystack, never stored or logged, and built
only once the test shows it is needed. The test waits on PAY-11: dedicated accounts enabled
and the percentage set. **Answered by.** Project owner, adopting the recommendation.

### PAY-21 · Paying from a check ✅

**Direction.** "If the vehicle or member is checked publicly on the verify page or
wherever, let there be a pay-now button somewhere so that they can click to transfer or
visit the link for payment. Payment should be easily accessible." Given by the project owner
on 5 October 2026.

**The conflict it raised.** Dues are internal (Requirement 27.8), so a public button that
showed what is owed would tell anyone who scans a sticker whether its driver is behind. And
a check is read-only, so a check cannot itself create a payment.

**Answer.** **Both of the following, built together** (roadmap item 31):

- **Officer screens.** Beside what is owed on an internal check, a Pay now button creates
  the Paystack link, shown as a QR code the driver scans to pay on their own phone and as a
  link to send. Where the member has a dedicated account, it shows that account and the
  exact amount to transfer.
- **Personal pay links, for the public.** Each vehicle and each member has its own
  unguessable pay link, with a QR code. It opens a public page offering the published levy
  or yearly fee, and never says what is owed or paid. Officers send it by WhatsApp or SMS
  from the Pay now button, and can replace it if it is misused. The page and its route
  belong to the payments module, not to verification, which stays read-only.

**Why links and not the sticker page.** The public sticker page (§23.13) is not built: its
address is printed in each sticker's QR code, so it waits on the domains (GOV-08), and the
only stickers that carry such a code are paused (VEH-20). Legacy barcodes open no page.
When the sticker page is built, every result that names a vehicle carries the same "Pay
NURTW dues" button, whether or not anything is owed.

**Answered on.** 5 October 2026. **Answered by.** Project owner: both options at first, then
personal pay links once told the sticker page does not exist. **Recorded at.** PRD
Requirement 27.8 (revision 1.9).

**Built as (item 31), with two choices the project made:**

- **What the public page names a member by:** first name and membership number, and
  nothing else of them. A vehicle is named by its plate.
- **The limits on the public page:** one address may open pay links 30 times a minute and
  start 10 payments an hour. Both are settings, changed without a release.

A link pays one month's levy, or one yearly fee, at a time. The System sends no message
itself: WhatsApp and SMS open on the officer's own device.

---

## 12. Deferred by the Union

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

## 13. Answered

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
| CARD-03 | Are the existing QR codes still honoured? | **Yes — resolved as fully equivalent.** Legacy barcodes are millisecond timestamps and forgeable by inspection; the risk was accepted to preserve 2,408 stickers already in the field. Read-only: no route can mint one. Which scheme resolved each verification is recorded. **Superseded in part by VEH-13 (22 September 2026):** a legacy barcode now resolves only after it has been reattached; PRD §26.4 revision pending. | PRD §26.4 |

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

## 14. Change log

| Date | Change |
|---|---|
| 7 October 2026 | The project owner passed on three recordings in which **Mr Timothy, Head of Operations**, goes through the live System (6 October). Answered: **MEM-15** (name, address, telephone first), **MEM-16** (next of kin: full name and telephone; address optional), **MEM-18** (the photograph is taken at registration and printed on the card), **VEH-33** (the order of the vehicle form), **VEH-34** (the chassis number is compulsory). Partly answered: **ORG-06** (Driver and Conductor head the list; the list itself is still not given), **MEM-17** (Area explained or dropped), **VEH-35** (a route says from where to where, which revises VEH-26). Added to **ORG-05** (remove the word "demo"; whether the placeholders stand is not settled) and **MEM-06** (a guarantor, where given: full name, telephone, address). He also reported that signing in is slow; that is a fault, not a question, and is in `plans/41`. Roadmap items 41 to 43. |
| 6 October 2026 | The project owner took up **VEH-29** (stock by scanning, held by a new permission in no role) and gave **VEH-31** (assigning a sticker is pay, then scan) and **GOV-21** (the previous operator is not named; a screen says only "sticker"). New **VEH-32** is open: whether a second officer confirms stock. PRD revised to 1.12; roadmap items 27 and 36. Totals: 93 answered, 37 awaiting, 1 deferred. |
| 5 October 2026 (stickers) | New VEH-30: a banner on every vehicle without a sticker, and a prompt after adding one, given and answered the same day. While new stickers are paused, a vehicle with no legacy barcode on the register is told so and charged nothing (roadmap item 35). |
| 5 October 2026 (interface) | New EXT-21: the API administrator invites an organisation by a personal link, given and answered the same day (roadmap item 33). PRD revised to 1.10. The owner also directed a redesign of the interface, with a sidebar and a dark theme (items 32 and 34). That is not a Union question; it is recorded in `DESIGN.md`. |
| 5 October 2026 | The project owner went through the open questions. Answered: GOV-18 (a go-live gate), EXT-08 (at once for cause, 30 days' notice otherwise), EXT-12 (production only), EXT-13 (no name, ever), EXT-17 (keep, review after the pilot). Partly answered: EXT-05 (one pilot after go-live; which one open) and GOV-11 (no parallel running; the date waits on named gates). Added to answered ones: PAY-11 (the percentage is Paystack's fee plus 0.5 per cent, set on a new Settlement screen) and PAY-20 (a bank account number follows the BVN rule). GOV-08 left open. New EXT-20, organisations applying for themselves, given and answered the same day (roadmap item 29). New PAY-21, a pay-now button on officer checks and a personal pay link for the public, never showing what is owed (roadmap item 31). PRD revised to 1.9. |
| 4 October 2026 (item 28) | Officer accounts and multi-factor sign-in were found unbuilt. The project owner answered GOV-16 (a temporary password at first sign-in), GOV-17 (a second factor for privileged permissions), GOV-19 (composed roles at launch), and GOV-20 (no database lock on audit events yet). New GOV-18, when the second-factor requirement is turned on, open. PRD revised to 1.8. |
| 4 October 2026 (item 14) | The project owner answered EXT-18 (totals by zone or branch only, rounded to the nearest 10) and EXT-19 (month, quarter, and year periods), adopting the recommendations. PRD revised to 1.7. |
| 4 October 2026 (item 13) | The project owner answered three new questions by adopting the recommendations: EXT-14 (rate-limit counters in Postgres), EXT-15 (daily quotas of 1,000 and 5,000), and EXT-16 (detection pauses an organisation for an hour). New EXT-17, the detection thresholds, open. PRD revised to 1.6. |
| 3 October 2026 (item 12) | New EXT-13: whether an outside membership check may ever carry the holder's name. Open; item 12 discloses none. |
| 3 October 2026 (item 11) | The project owner answered EXT-06 (the API administrator approves; one officer may register and approve) and EXT-07 (a data-sharing agreement is required before approval), and two new questions: EXT-10 (token reminders on the dashboard until a mail service exists) and EXT-11 (the officer chooses how long a replaced token keeps working). New EXT-12, a test environment for outside organisations, open. PRD revised to 1.5. |
| 3 October 2026 | The project owner answered VEH-27, PAY-18, PAY-19, and PAY-20 by adopting the recommendations (items 25 and 26 build the first three). New VEH-28: a vehicle's declaration status is shown only to holders of `vehicle.declare`. New VEH-29: adding the previous operator's unrecorded stickers by scanning, deferred. VEH-20's new sticker paused; VEH-21 being revisited. PRD revised to 1.4. |
| 2 October 2026 (item 23) | New PAY-20: whether members' BVNs may be collected if Paystack requires identification before it opens a dedicated account. Open, and it blocks dedicated accounts only if Paystack does require it. PAY-18 notes the case item 23 adds: part of a membership fee arriving before the rest. |
| 27 September 2026 (item 22) | New PAY-18 (a membership fee paid early or after a gap) and PAY-19 (when a levy stops; re-pricing on a change of route type). Both open, and neither blocks item 22, which applies PAY-03 as written. |
| 26 September 2026 (item 18) | New VEH-27: whether the vehicle letter can be reissued when its driver or unit changes after onboarding. Open, and it blocks nothing: item 18 issues one letter per onboarding and keeps it as printed. |
| 26 September 2026 | Answers from the project owner after a call with Mr Timothy. New VEH-23 (a `vehicle.record` permission and a Field enumerator role; declaring stays restricted), VEH-24 (a vehicle may be linked to a pending applicant), VEH-25 (owner name and phone required, address optional, held as sensitive data), VEH-26 (route type required: interstate, intercity, town service). MIG-04 answered: the driver is the member, the owner is recorded on the vehicle. New MIG-07: import after the owner fields exist, locally first. PAY-02 revised: levy ₦7,000. New PAY-14 (levy priced by route type), PAY-15 (processing fee unchanged), PAY-16 (stay on Paystack pending the provider comparison), PAY-17 (link plus dedicated account; USSD after launch; dedicated accounts already enabled). PRD revised to 1.3. |
| 22 September 2026 (close) | Launch amounts set by the owner: stickers ₦2,000 (both), levy ₦5,000 a month, membership ₦30,000 a year (PAY-02, VEH-20). The owner directed that every remaining question in this thread be settled by recommendation, with no further questions. VEH-18, VEH-19, VEH-22, PAY-03, PAY-04, PAY-08, and PAY-05's renewal point were closed that way, each marked “adopting the recommendation”. PAY-09: revision 1.2 is approved by the project owner. No PAY question remains open. |
| 22 September 2026 | Direction relayed by the project owner from a conversation with NURTW, covering legacy stickers, onboarding, what counts as a vehicle, and payments. Recorded as **VEH-13** and **PAY-01**. It supersedes CARD-03 in part and reverses PRD §2.2's exclusion of revenue collection, so a PRD revision is required. New questions VEH-14–20 and PAY-02–09. Fee types are to be data, not code, so more can be added without a deploy. Later the same day, the owner answered VEH-14–17, PAY-05 and PAY-06, and parts of PAY-02 and PAY-07. PAY-10 records the contractor-fee formula (0.5 per cent capped at ₦200, payer-borne), checked against the owner's worked table. New questions VEH-21, VEH-22 and PAY-11. PRD revised to 1.2 (§2.3, §9A, §13, §23.19–23.20, §26.4, §27). Then: PAY-11 answered (A — dues by dedicated account or link, stickers by link only); PAY-07 answered (the NURTW account is added and changed from settings); VEH-15 corrected (the previous operator has stopped) and VEH-21 answered (the register is closed). VEH-20 reworded in plain terms and made a settings change. New questions PAY-12 and PAY-13, both then answered: oldest due first; the super administrator alone changes the settlement account, with no second approver and a full audit trail. |
| 17 September 2026 | CARD-06 answered ("Safety and Unity") and applied to the template. CARD-05 partly answered: the Union emblem supplied and embedded as a card watermark. Added `SEED_DEMO_DATA=true` to `apps/api/prisma/seed.ts`: real zones for all 21 LGAs (unconditional, per ORG-05), plus a demo branch/unit under each and an 8-entry demo designation list (both gated behind the flag, clearly marked as placeholder, not a Union answer) — so a demo deployment can complete a registration and issue a card. CARD-07 (signature images) and the rest of CARD-05 (full artwork) were deliberately not stood in for; see §3. |
| 14 September 2026 | Answers received from Mr Timothy, Head of Operations. MEM-05 and CARD-04 answered in full; ORG-05, MEM-06, and CARD-07 partly answered; new VEH-12 recorded (vehicle onboarding and legacy-sticker rebinding) with the pre-existing sticker URL format for items 07–08. Card template `v1-provisional` now carries a twelve-month validity; guarantor is no longer required to register an application. |
| 9 September 2026 | Register created. 26 answered, 43 awaiting, 1 deferred. ORG-05 and ORG-06 identified as blocking item 05. |
| 10 September 2026 | MEM-04 extended to ask explicitly whether the recording officer may decide. The control is built and shipped disabled; the question now gates a settings change rather than any development. |
| 9 September 2026 | Item 06 delivered. CARD-05 and CARD-07 added to the blocking list: neither blocked the build, both block printing a card for a member. CARD-04, CARD-06, and CARD-08 confirmed as configuration or authority questions that the built mechanism already accommodates. |
