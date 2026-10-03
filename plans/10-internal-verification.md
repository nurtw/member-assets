## Item
10 — internal-verification

## Source
PRD §11 (Requirements 11.1–11.3), §26 (Requirements 26.1, 26.3), §9A.1, §22, §27
(Requirement 27.8), acceptance criteria 5 and 12. `ARCHITECTURE.md` Decisions 5.1, 5.3,
5.4, 6.2.1–6.2.3, 6.5. `QUESTIONS.md` VEH-17, VEH-22, PAY-05. `DESIGN.md` §3, §5.

## Goal
An officer holding `verification.perform` checks a vehicle by plate, by sticker (a signed
QR payload or a Transpay barcode), or by both together, on a page built for a phone at the
roadside. The verdict follows one rule that item 12 will share. Behind the verdict, the
internal result shows every state: on record, declared, onboarded, the sticker's status, a
plate mismatch, and a register reading. Dues appear beside it, never inside it. Every check
is audited, and nothing else is written.

## Approach
1. **Domain, pure** (`packages/domain/src/verification/`):
   - `decideVerification` returns matched or not, with reasons in a fixed order. A plate
     matches when its vehicle is declared and onboarded. A sticker matches when it is
     attached and `ACTIVE` and its vehicle is declared. A combined check also needs the
     sticker's vehicle to carry the presented plate.
   - `stickerCodeScheme`: a code containing the payload separator is signed and must pass
     its signature before any lookup. Anything else is looked up on the closed Transpay
     register by exact value.
   - `projectVerification` is Decision 5.3's single projection function. It works over a
     closed field catalogue, and each field is marked external-admissible or internal-only.
     The output holds exactly the permitted catalogue fields. On the external channel it
     drops internal-only fields whatever a profile says. No catalogue field carries a
     phone, address, next of kin, guarantor, chassis or VIN, signature, note, owner, or
     dues.
2. **API** (`verification` module):
   - `POST /verifications` takes `{ plateNumber?, stickerCode? }`, and which ones are
     present decides the check. It requires `verification.perform` anywhere, because an
     officer checks whatever vehicle is in front of them.
   - The internal permitted set is the base fields, plus `vehicle_id` with `vehicle.read`
     over the vehicle, plus the member fields with `member.read` over the member.
   - Dues sit beside the verdict, under the same checks as the dues routes.
   - The reference is the request id. Every check is audited with its outcome, reasons,
     and identifier scheme. An invalid signature is audited as
     `verification.invalid_signature`. An unconfigured signing secret answers 503 rather
     than declaring genuine stickers forged.
3. **Web:** a `/verify` portal page, with the verdict shown by word, shape, and colour
   (`DESIGN.md` §3). It lists the facts and dues, and links to the vehicle when that is
   allowed. Signing in lands each officer on the first screen they may use.
4. **Tests:** domain units, plus e2e that covers every outcome. The e2e also checks that a
   forged code makes no lookup, that nothing outside the audit trail is written, and that
   no response carries a sensitive fixture value.

## Out of scope
Membership and card verification (`verification.membership`, with item 12). External
endpoints and profiles as rows (items 11–12). Rate limits (item 13). Camera scanning:
whether the printed QR encodes the bare payload or a public-page URL is decided with the
public page.

## Definition of done
- [x] Plate, sticker, and combined checks report MATCH or every reason, including a plate
      and sticker mismatch (acceptance criterion 5).
- [x] A bad signature is refused before any lookup and audited as such.
- [x] Member fields, the vehicle link, and dues appear only within the officer's scope.
- [x] No response holds a sensitive value (criterion 12). Verification writes only audit
      rows.
- [x] Domain 307, contracts 35, API 129; e2e 222/223 locally (verification 20/20; the one
      failure is the known `DEMO_` designations test). Typecheck and lint are clean.
      `openapi.json` is regenerated.

**Decided while building (3 October 2026):**

- **One verdict rule for every channel.** The internal headline uses VEH-22's rule, so an
  officer never sees VERIFIED for a vehicle an outside organisation would be told is not
  found. What the internal channels add is the reasons.
- **A plate check needs the vehicle declared and onboarded, not a working sticker.**
  "Onboarded" means a sticker has been attached at some point (Decision 6.5), so a sticker
  later reported lost does not stop the plate verifying. The sticker's status is shown
  beside the verdict. A sticker check needs the sticker itself to be `ACTIVE`.
- **One internal route, `POST /verifications`**, rather than three. Which fields are present
  decides the check, and proposal §12.3's paths stay free for item 12.
- **Projected fields carry the names the response uses** (flat, as in proposal §12.5), so
  a disclosure profile names exactly what will appear. Item 11 seeds profiles under these
  names. The schema's `DisclosureField.fieldPath` comment, which still says "dotted path",
  should be updated then.
- **A combined check compares the plate with the sticker's own vehicle.** It does not look
  the plate up separately; a plate check is one more tap.
- **The reference is the request id**, which the audit event carries.
- **Without `STICKER_SIGNING_SECRET`, a signed code answers 503** instead of being audited
  as a forgery.
- **Read-only is enforced twice:** a unit tripwire that scans the module for write calls,
  and an e2e snapshot of the rows a check could touch.
- **Signing in lands each officer on the first screen they may use**, so a verification
  officer lands on Verify rather than on a refusal.
- The OpenAPI generator now honours `@HttpCode`. Login, logout, the Transpay lookup, and
  verifications are documented as 200, which is what they return.

**Pending:**

- The screens have not been opened in a browser.
- Camera scanning waits on deciding what the printed QR encodes.
- Membership verification (`verification.membership`) comes with item 12.

**Amended 3 October 2026:**

- **Declaration status is for holders of `vehicle.declare` only** (`QUESTIONS.md` VEH-28),
  so the goal's "every state" no longer includes it for other officers. They are told the
  vehicle's record is not complete, never that it is undeclared. The audit trail keeps the
  true reasons.
- **Membership verification is built**, as item 24.
- **New NURTW stickers are paused** (VEH-20), so the signed-code path has no stickers to
  check for now.
