# Union Question Register

## NURTW Membership and Vehicle Verification System

**Document version:** 1.3
**Last revised:** 22 September 2026

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
| Cards (CARD) | 5 | 3 | — | 8 |
| Vehicles and stickers (VEH) | 16 | 6 | — | 22 |
| Legacy migration (MIG) | 3 | 3 | — | 6 |
| External organisations (EXT) | 4 | 5 | — | 9 |
| Payments (PAY) | 13 | 0 | — | 13 |
| Governance and go-live (GOV) | 4 | 10 | 1 | 15 |
| **Total** | **53** | **40** | **1** | **94** |

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

### VEH-13 · Unattached legacy stickers, paid onboarding, and what counts as a vehicle ✅

**Answer — direction as relayed.**

1. Every legacy sticker is **unattached**. A vehicle that has not been re-onboarded does not
   count as declared at all.
2. Stickers are reattached through the System. Nobody may be able to generate a barcode and
   attach it. Transpay-era stickers cannot be told apart from fabricated ones by looking at
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

- **Allow-list.** Only barcodes on the imported Transpay register can be attached. At
  launch that is the 2,408 in the export. Any other barcode is refused and recorded as
  unknown. It is not called a forgery, because Transpay still issues stickers (VEH-15).
- **One-shot.** Each barcode attaches once. A second attempt is refused and flagged.
- **Plate-bound.** The register ties each barcode to exactly one plate, and there is no
  override (VEH-16).
- **Paid.** Nothing is attached without a payment Paystack has confirmed, and each payment
  reference is used once.

**Answered on.** 22 September 2026. **Answered by.** Relayed by the project owner from a
conversation with NURTW; the Union official is to be named (PAY-09).
**Recorded at.** PRD §2.3 (revision 1.2), §9A, §13, §23.19, §26.4.

### VEH-14 · Is the Transpay security code printed on the sticker? ✅

**Question.** The export holds a 5-character `security_code` against nearly every barcoded
vehicle, and it cannot be derived from the barcode. Is it printed on the physical Transpay
sticker, either visibly or under a scratch panel?

**Answer.** **No.** The code comes from Transpay and does not appear on the sticker. It is
adopted as an imported record only and plays no part in reattachment or verification.
Nothing printed on a Transpay sticker distinguishes a genuine one from a copy, so the
controls in PRD §9A carry the whole load.
**Answered on.** 22 September 2026. **Answered by.** Project owner.
**Recorded at.** PRD §9A (Requirement 9A.5), §23.19.

### VEH-15 · Is Transpay still issuing stickers? ✅

**Question.** Can Transpay still issue or print stickers, and does unissued Transpay stock
exist anywhere?

**Answer.** **No — Transpay has stopped.** The owner first said Transpay was still issuing,
then clarified the same day. Transpay generates no more stickers. NURTW holds a few printed
Transpay stickers with no softcopy record, and those are the last of them. None carries the
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

**Question.** From go-live, a Transpay sticker that has not been reattached will not verify
as a match. On day one, almost every vehicle will therefore scan as not found. Is there a
grace period? What should an officer see?

**Answer.** **No grace period; not found is acceptable.** The result should tell the officer
that the sticker is genuine but not attached.

**Applied as.** This is shown on the internal channels only (dashboard and officer portal).
The copy reads *"Recognised Transpay sticker — not attached"*, followed by the plate the
register records for it. The System can confirm that a barcode is on Transpay's register and
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

- **Reattachment.** The vehicle already carries a Transpay sticker on the register. The
  owner pays, and the officer attaches that existing sticker. Nothing new is printed.
- **New sticker.** The vehicle has no usable Transpay sticker. That covers brand-new
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

### VEH-21 · Refreshing the Transpay register ✅

**Question.** Only barcodes on the imported register can be reattached. How would barcodes
issued after the export get onto it?

**Answer.** **They don't need to. The register is closed.** Transpay has stopped issuing
(VEH-15), so the export's 2,408 barcodes are the complete register, and nothing is ever
added after the migration. The few printed Transpay stickers NURTW still holds have no
digital record. They are not on the register and **can never be attached**. A vehicle that
would have received one gets a new signed NURTW sticker instead.

**Recommended.** Retire or destroy that printed stock. The System refuses those barcodes
anyway, but a stack of genuine-looking Transpay stickers is useful to nobody except someone
trying to pass one off in the field.
**Answered on.** 22 September 2026. **Answered by.** Project owner.
**Recorded at.** PRD Requirement 9A.4, §23.19, §26.4.

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

## 11. Payments (direction of 22 September 2026) — all answered

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
| Monthly levy | ₦5,000 per vehicle per month, for every category until per-category figures are set |
| Yearly membership | ₦30,000 |

These are **not placeholders**, so live charging is permitted. The contractor's fee is
settled at PAY-10.
**Answered on.** 22 September 2026. **Answered by.** Project owner.
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

**Question.** Does a member owe levy for months before they were onboarded? The Transpay
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
| 22 September 2026 (close) | Launch amounts set by the owner: stickers ₦2,000 (both), levy ₦5,000 a month, membership ₦30,000 a year (PAY-02, VEH-20). The owner directed that every remaining question in this thread be settled by recommendation, with no further questions. VEH-18, VEH-19, VEH-22, PAY-03, PAY-04, PAY-08, and PAY-05's renewal point were closed that way, each marked “adopting the recommendation”. PAY-09: revision 1.2 is approved by the project owner. No PAY question remains open. |
| 22 September 2026 | Direction relayed by the project owner from a conversation with NURTW, covering legacy stickers, onboarding, what counts as a vehicle, and payments. Recorded as **VEH-13** and **PAY-01**. It supersedes CARD-03 in part and reverses PRD §2.2's exclusion of revenue collection, so a PRD revision is required. New questions VEH-14–20 and PAY-02–09. Fee types are to be data, not code, so more can be added without a deploy. Later the same day, the owner answered VEH-14–17, PAY-05 and PAY-06, and parts of PAY-02 and PAY-07. PAY-10 records the contractor-fee formula (0.5 per cent capped at ₦200, payer-borne), checked against the owner's worked table. New questions VEH-21, VEH-22 and PAY-11. PRD revised to 1.2 (§2.3, §9A, §13, §23.19–23.20, §26.4, §27). Then: PAY-11 answered (A — dues by dedicated account or link, stickers by link only); PAY-07 answered (the NURTW account is added and changed from settings); VEH-15 corrected (Transpay has stopped) and VEH-21 answered (the register is closed). VEH-20 reworded in plain terms and made a settings change. New questions PAY-12 and PAY-13, both then answered: oldest due first; the super administrator alone changes the settlement account, with no second approver and a full audit trail. |
| 17 September 2026 | CARD-06 answered ("Safety and Unity") and applied to the template. CARD-05 partly answered: the Union emblem supplied and embedded as a card watermark. Added `SEED_DEMO_DATA=true` to `apps/api/prisma/seed.ts`: real zones for all 21 LGAs (unconditional, per ORG-05), plus a demo branch/unit under each and an 8-entry demo designation list (both gated behind the flag, clearly marked as placeholder, not a Union answer) — so a demo deployment can complete a registration and issue a card. CARD-07 (signature images) and the rest of CARD-05 (full artwork) were deliberately not stood in for; see §3. |
| 14 September 2026 | Answers received from Mr Timothy, Head of Operations. MEM-05 and CARD-04 answered in full; ORG-05, MEM-06, and CARD-07 partly answered; new VEH-12 recorded (vehicle onboarding and legacy-sticker rebinding) with the pre-existing sticker URL format for items 07–08. Card template `v1-provisional` now carries a twelve-month validity; guarantor is no longer required to register an application. |
| 9 September 2026 | Register created. 26 answered, 43 awaiting, 1 deferred. ORG-05 and ORG-06 identified as blocking item 05. |
| 10 September 2026 | MEM-04 extended to ask explicitly whether the recording officer may decide. The control is built and shipped disabled; the question now gates a settings change rather than any development. |
| 9 September 2026 | Item 06 delivered. CARD-05 and CARD-07 added to the blocking list: neither blocked the build, both block printing a card for a member. CARD-04, CARD-06, and CARD-08 confirmed as configuration or authority questions that the built mechanism already accommodates. |
