# 06 — membership-card-issuance

## Item

Membership cards: the nine-state lifecycle, card-number allocation, the issuance,
approval, and replacement workflow, versioned card templates, officer signature
assets — and the print pipeline, which item 05 deliberately deferred here.

## Source

PRD §8 (Requirements 8.1, 8.2), §23.5 (validity per template), §23.6 and §26.1
(number format), §23.7 (officer signatures), §23.16 (hybrid signatures — the
print-ready form). Card fields at `docs/Proposal_for_the_Development_and_Implementation_of.md`
§8. Visual identity and card fidelity at `DESIGN.md` §7. `ARCHITECTURE.md` listed
the print-rendering approach as a matter to be decided *at this item*; it is now
recorded there as §14, Printing.

## Goal

An officer can prepare a card for an approved member, have it approved and issued,
print it, replace it when it is lost, and suspend or cancel it — with the printed
artifact reproducible years later exactly as it left the printer, and with every
step scoped to the officer's own part of the Union and recorded in the audit trail.

## Five questions this item does not answer

`QUESTIONS.md` **CARD-04** (validity period), **CARD-05** (official artwork at print
resolution), **CARD-06** (the motto wording in each position), **CARD-07** (the
signing officers and their signature images), and **CARD-08** (the replacement
process) are all open.

They do **not** block the item, and it matters exactly how:

| Question | What is built without it | What arrives with the answer |
|---|---|---|
| CARD-04 | The whole expiry path — validity, expiry date, `EXPIRED` — built and tested | One template field set from `null` to a number of months |
| CARD-05 | A template that lays out every field at the correct physical dimensions, drawn from the palette in `DESIGN.md` §2 | New artwork behind the same field geometry, as `v2` |
| CARD-06 | Both motto strings are template configuration, not literals in the renderer | Two strings corrected |
| CARD-07 | Signature *assets* — upload, positions, activation, audit | The two images |
| CARD-08 | Replacement as a mechanism: supersede, preserve, re-issue | Who authorises it, and any fee or form |

**The template ships marked provisional and refuses to be the default in
production.** `DESIGN.md` §2 is explicit that the palette is inferred from a
daylight photograph and must be replaced with sampled values before anything is
printed. A card printed against guessed artwork and handed to a member is not a
draft that can be revised — it is in their pocket. So the provisional template
carries a visible `PROVISIONAL TEMPLATE` mark, and removing that mark is a
deliberate act taken when CARD-05 arrives.

## Key decisions

### 1. Print rendering is `pdf-lib` — no browser

`ARCHITECTURE.md` left this open until now; the outcome is recorded there as Decision 14.1. Three candidates:

| Approach | Why not |
|---|---|
| Headless Chromium (Puppeteer/Playwright), HTML → PDF | Adds ~300 MB and a full browser to a container that otherwise runs a Node process. A browser is a remote-code-execution surface being handed member photographs, and it must be kept patched on the Union's schedule rather than Google's. Layout also depends on a font stack resolved inside the image — the same HTML renders differently after a base-image bump, which is precisely what `template_version` exists to prevent. |
| `@react-pdf/renderer` | A flexbox layout engine over PDF primitives. Convenient for flowing documents; for a card it interposes a layout algorithm between the specification and the millimetre. |
| **`pdf-lib`** | **Chosen.** Pure JavaScript, no native dependency, no browser. Layout is deterministic because positions are computed from font metrics the library carries, so the same card renders identically on a laptop and in production. |

A membership card is a fixed-size artifact — ISO/IEC 7810 ID-1, 85.60 × 53.98 mm —
with about a dozen elements at fixed positions. That is a coordinate problem, not a
layout problem, and the tool that treats it as a coordinate problem is the right one.

Two costs are real and accepted. The wet-signature form (§23.16) is a flowing A4
document, and flowing text on `pdf-lib` means measuring and wrapping by hand —
one small helper, written once, and it keeps a browser out of the container. And
the launch template uses the standard fourteen PDF fonts rather than an embedded
typeface, so glyph rasterisation is the viewer's: embedding a licensed face is
deferred to the version cut against the Union's own artwork, which is when the
typefaces are specified anyway (Decision 14.4).

### 2. A template is a versioned module, not a database row

`template_version` is already a column on `card` (item 02), justified by
`ARCHITECTURE.md` §12 as the thing that lets a redesign proceed without invalidating
issued artifacts. That promise only holds if the *old* renderer still exists.

So a template is a module in `apps/api/src/card/templates/`, registered under its
version, holding geometry, colours, strings, and a draw function. A card records
which version it was rendered against, and re-rendering it years later selects that
module. Deleting a template module is therefore a breaking act, and the registry
test says so.

This is deliberately *not* Decision 5.2's "profiles are rows, not code" treatment.
Disclosure profiles change when the Union onboards an organisation, which must not
require a deploy. A card redesign is a print-shop event with a lead time measured in
weeks, and it needs the artwork committed and reviewed. The two have opposite
change profiles.

### 3. A card number is allocated when the card is issued, not when it is drafted

Same reasoning as the membership number in item 05, and it applies more sharply
here. `card.card_number` becomes nullable and is filled in the transaction that
moves the card to `ISSUED`.

A `DRAFT` card is a proposal to print a card. A `CANCELLED` draft was never printed
and is in nobody's pocket; a number against it would sit in the register naming an
artifact that does not exist, and the register is exactly where an officer goes to
ask whether a presented card is real. Nothing is lost by allocating late — §26.1
requires the number convey no sequence, so there is no counter to advance.

### 4. A proof is visibly a proof

Directly downstream of decision 3. A card not yet `ISSUED` renders **without a card
number and under a diagonal `PROOF — NOT ISSUED` overprint**.

Without this the approval step is decorative: an officer would print the draft,
laminate it, and hand it over, and it would be indistinguishable from the issued
article. The overprint is what makes "approved for issuance" a real gate rather
than a screen the workflow passes through.

### 5. The card row snapshots what was printed on it

A card is a physical object. A member transfers between branches; a designation is
renamed; the Union corrects a spelling. The card in the member's pocket still reads
what it read on the day it was printed, and a reprint of a damaged card must match
it.

Re-rendering from live member data would produce a *different card bearing the same
number*, which defeats verification: the officer at the roadside compares what is in
their hand against what the System says, and the System must say what was printed.

So `card` gains an explicit set of printed columns — holder name, address as
printed, designation, state, branch, unit, membership number — populated at
issuance and never recomputed. `card.membership_number` is already in the canonical
field list (proposal §24) as a column on the card, which is the same instinct.

The printed **address** is additionally a disclosure matter. The proposal specifies
a card-display address "which may be shorter than the full residential address", and
Decision 10.1 keeps the residential address in `member_contact`, out of reach of
card-display data. The officer composes the card address at issuance; the card
module never joins `member_contact`.

### 6. At most one live card per member, enforced in the database

A partial unique index, the same mechanism as the vehicle declaration index of
PRD §9.2:

```sql
CREATE UNIQUE INDEX "card_one_live_per_member"
  ON "card" ("member_id") WHERE "status" IN ('ISSUED', 'ACTIVE');
```

Two live cards for one member means two credentials answer for one person, and
suspending one leaves the other working. History stays open: `EXPIRED`, `REPLACED`,
`LOST`, and `CANCELLED` cards accumulate without limit, which is Requirement 8.1.

Prisma cannot express a partial index, so this is raw SQL in the migration —
alongside `vehicle_one_active_declaration_per_plate`, and subject to the same
standing instruction that future migrations must preserve it.

### 7. A card is issued only to a member in good standing

`isMemberInGoodStanding` already exists in `packages/domain`. A card is Union
credentials; issuing one to a `PENDING` applicant would grant the credential to
somebody the Union has not admitted, and issuing one to a `SUSPENDED` or
`CANCELLED` member would restore by the back door what a suspension took away.

Checked at draft *and* re-checked at issuance, because the two can be days apart.

### 8. Officer signature assets are records, with a position and a lifetime

PRD §23.7 — approved signature images held against the officer record, composited
at print. This item introduces `officer_signature`: a position (`PRESIDENT`,
`GENERAL_SECRETARY`), the officer's name and title as printed, a media asset, and
active/superseded state.

Only one signature is active per position at a time, and replacing one supersedes
rather than overwrites — an officer leaves office, and cards issued under their
signature must remain explicable. `card_template.manage` gates the whole surface,
and every change is audited: a forged signature asset would forge every card issued
afterwards.

### 9. The wet-signature form lands here, on the same pipeline

Deferred from item 05 precisely so it could share this. It renders the applicant's
completed registration data onto an A4 form for physical signature — the other half
of the hybrid at PRD §23.16.

It reads sensitive registration data and therefore requires `member_sensitive.read`,
not `card.read`. It is a different document with a different disclosure profile that
happens to use the same renderer.

## Approach

1. **Domain first.** `packages/domain/src/card/status.ts` — the nine-state table,
   which transitions are legal, which states are live, which are terminal. No Nest,
   no Prisma, exhaustive tests including every illegal transition.
2. **Contracts.** Card request schemas and response types; the officer-signature
   positions.
3. **Schema.** `cardNumber` nullable; printed-value columns; `officer_signature`;
   the partial unique index as raw SQL.
4. **Rendering.** A `pdf` module: units and geometry helpers, embedded fonts, the
   text-wrapping helper, and the template registry. Template `v1-provisional`.
5. **API.** A `card` module — draft, submit, approve, issue, activate, suspend,
   restore, replace, cancel, list, get, render. **Every route resolves the member's
   organisation path and uses `can`.**
6. **API.** Officer signature management under `card_template.manage`.
7. **The registration form** on the same pipeline, under `member_sensitive.read`.
8. **Web.** The card panel on the application/member screen, and a cards list.

## Files likely touched

`packages/domain/src/card/**`, `packages/contracts/src/card.ts`,
`apps/api/src/card/**`, `apps/api/src/pdf/**`, `apps/api/prisma/schema.prisma` +
migration, `apps/web/src/app/(app)/cards/**`, `docs/reference/openapi.json`
(regenerated).

## Out of scope

- **Sticker templates.** Item 08, on this pipeline once it exists.
- **Bulk card production runs.** The proposal lists bulk workflows as a later
  phase; one card at a time is the workflow the Union has today.
- **Physical card stock control.** VEH-10 asks the equivalent question for
  stickers, where tamper-evident stock is a security control. Card stock is plain.
- **A renewal scheduler.** Expiry is computed and stored; a job that sweeps expired
  cards is item 15 work, and nothing in the verification path trusts the stored
  status over the stored date.

## Definition of done

- [x] The nine-state lifecycle is a domain table, tested exhaustively including every illegal transition.
- [x] A card number exists after issuance and does not exist before it.
- [x] A cancelled draft leaves no card number allocated.
- [x] A card not yet issued renders with no number and a visible proof overprint. *The absence of the number and the proof filename are asserted end to end; the overprint itself is asserted structurally, because pdf-lib writes compressed object streams and the drawn text is not greppable. The decision it depends on is tested directly at `isCardIssued`.*
- [x] A member not in good standing cannot be drafted or issued a card. *Re-checked at issuance, since preparation and approval can be days apart.*
- [x] A second live card for one member is refused by the database, not only by the service.
- [x] Replacing a card supersedes the original and preserves the relationship in both directions.
- [x] The printed values are a snapshot: changing the member's name or unit after issuance does not change the issued card.
- [x] The card module never reads `member_contact`, asserted — no contact, next-of-kin, or guarantor data appears in any card projection.
- [x] An officer scoped to one branch cannot read, draft, approve, or issue another branch's cards; out-of-scope cards answer 404, not 403.
- [x] Rendering an old `template_version` selects the old template; an unknown version is refused rather than falling back. Asserted against a registry test that names every version ever issued.
- [x] Only one officer signature is active per position; replacing one supersedes it. *Enforced by a partial unique index and by a single transaction.*
- [x] The registration form requires `member_sensitive.read`, not `card.read` — asserted, including the refusal for an officer who may read applications but not sensitive data.
- [x] Every mutation writes an audit event.
- [x] `pnpm build`, `typecheck`, `lint`, `test` all pass.

## Notes

The risk in this item is not the workflow — it is that a card is the first thing
the System produces that leaves the building and cannot be recalled. Two rules
carry that weight: a proof must be visibly a proof, and an issued card must
re-render exactly as it was printed. Everything else is ordinary CRUD with a
permission check.

The second risk is the provisional artwork. It is tempting to treat "close enough
from the photograph" as done, because it looks right on screen. It is not done, and
the template says so on its face until CARD-05 arrives.

## Outcome

Delivered. **362 tests pass** — 270 unit (162 domain, 29 contracts, 79 api) and 92
end to end.

The wet-signature registration form (§23.16), deferred from item 05, landed here on
the same pipeline as promised.

### Three defects worth recording

**A bare `Buffer` returned from a controller becomes JSON.** Nest serialises a
returned object, and a Buffer is an object, so `GET /cards/{id}/document` answered
200 with `{"type":"Buffer","data":[...]}` — while still carrying the
`Content-Type: application/pdf` header that had been set by hand. Every
header-level assertion passed. It was caught only because the card test compared
the first five bytes against `%PDF-`.

The media route had used the same pattern since item 05 and its success path
asserted headers but never bytes, so the same defect would have been invisible
there. Both now return a `StreamableFile`, and the media test compares the served
bytes against what was uploaded.

**A flaky assertion from item 03, failing on correct code.**
`all-exceptions.filter.spec.ts` scanned the whole serialised error response for
`/42|branch/` to prove a forbidden response leaked no detail — but the response
also carries a randomly generated request id, and a UUID contains "42" often
enough that the test failed roughly one run in six. Narrowed to the message and
the code. Exactly the failure mode already recorded for the OpenAPI secret scan:
an assertion broad enough to fire on correct code gets deleted the first time
somebody is in a hurry.

**`vitest` does not read `.env` either.** The third instance of the same trap. The
end-to-end suite passed only on a machine where `DATABASE_URL` happened to be
exported in the shell; on a clean one every suite failed at module construction
with an error that reads like missing configuration. Fixed with
`test/setup-env.ts` wired in through `setupFiles`.

### One design correction found by a test

`REPLACEABLE_CARD_STATUSES` and the transition table disagreed about `ISSUED`: the
list said an issued card could be replaced, the table did not allow
`ISSUED → REPLACED`. The two are written independently in the domain package
precisely so that a test comparing them catches this. Resolved in favour of
permitting it — a card spoiled in the office is superseded rather than cancelled,
because cancelling retires the number with no successor recorded, and the chain is
the only thing that later explains why it is dead.

### What the Union still gates

Nothing here blocked the build, and each is a configuration or asset change rather
than a code change:

- **CARD-05** — the official artwork. `v1-provisional` prints
  `PROVISIONAL TEMPLATE — ARTWORK PENDING` across its foot, and the officer portal
  shows a warning on any card carrying a provisional template. Cut a **v2** when
  the artwork arrives; do not edit v1, or every card issued under it re-renders
  differently from the article in its holder's pocket.
- **CARD-07** — the signature images. Cards issue with blank officer signature
  lines, and each such issuance records `officerSignaturesPresent: false` in the
  audit trail, so they can be found and replaced. `OPERATIONS.md` carries the query.
- **CARD-04** — the validity period. `validityMonths` is `null`, so no card
  expires. The whole expiry path is built and tested, including month-end clamping.
- **CARD-06** — the motto wording. Both strings are template configuration.
- **CARD-08** — who authorises a replacement. The mechanism is superseding; the
  answer changes who may call it, not what it does.

### Deferred, with reasons

- **Bulk card production runs.** The proposal puts bulk workflows in a later
  phase, and one card at a time is the workflow the Union has today.
- **A renewal sweep.** Expiry is computed and stored; a job that moves expired
  cards to `EXPIRED` belongs to item 15. Nothing in the verification path will
  trust the stored status over the stored date.
- **An embedded typeface.** The launch template uses the standard fourteen PDF
  fonts, so layout is deterministic but glyph rasterisation is the viewer's.
  Embedding a licensed face belongs with the artwork at CARD-05, which is when the
  typefaces are specified anyway (Decision 14.4).
- **Card stock control.** VEH-10 asks the equivalent question for stickers, where
  tamper-evident stock is a genuine security control. Card stock is plain.
