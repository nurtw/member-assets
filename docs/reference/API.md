# API Reference

## NURTW Membership and Vehicle Verification System

**Last revised:** 3 October 2026 · **API version:** v1

---

## 1. Status of this document

This document explains the conventions that hold across the entire API. The
endpoint-by-endpoint description is **generated from the running application** and lives at
[`openapi.json`](openapi.json) beside this file.

That separation is deliberate. Endpoint lists written by hand describe the API as it was
understood on the day someone wrote them. The generated document reads the route table
from the application's dependency-injection container and derives request bodies from the
same schemas the API validates against, so it cannot describe a route that does not exist,
cannot omit one that does, and cannot disagree with the validation actually performed. A
route added without documentation fails the test suite.

Regenerate after any routing change:

```bash
pnpm --filter api docs:openapi
```

Authenticated users may also fetch the current document from a running instance at
`GET /api/v1/docs/openapi.json`.

---

## 2. What this API is, and is not

The System administers members, transport units, declared vehicles, membership cards, and
vehicle stickers for the National Union of Road Transport Workers, Anambra State Council,
and answers verification enquiries under strict disclosure controls.

A verification response confirms **only that a matching NURTW record exists under the
requested criteria**. It is not evidence of ownership, roadworthiness, licensing, or
insurance, and no integrating system should present it as such. See PRD §4.

The API is not a public directory: there is no browsable member or vehicle listing, and no
endpoint returns a collection of members.

---

## 3. Versioning

Every route is served beneath `/api/v1`. Version 1 will not be broken once an external
organisation holds credentials against it. Breaking changes ship as `/api/v2`, served
concurrently, and the two are supported in parallel for a period agreed with integrators.

Additive changes — a new optional request field, a new field in a response, a new endpoint
— are **not** breaking and may arrive within v1. Clients must therefore ignore unrecognised
response fields rather than failing on them.

---

## 4. Authentication

Internal users authenticate with an **opaque session token**, issued by
`POST /api/v1/auth/login` and delivered as an `httpOnly` cookie named `nurtw_session`. The
token is never returned in a response body, so it cannot be recovered from a logged
response or a captured XHR trace.

Sessions rather than signed tokens, because **revocation must take effect on the next
request**. A signed token cannot offer that without a denylist, which reintroduces the
lookup the token was meant to avoid while leaving a window in which a dismissed officer's
credential still works.

External organisations authenticate by API token instead, through a mechanism sharing no
storage with internal sessions. An API token can never satisfy an internal route, and a
session can never satisfy an external one.

### API tokens

- **Sent as `Authorization: Bearer <token>`**, and read from nowhere else. A token in a query
  string or a cookie authenticates nothing.
- **A token looks like `nurtw_abcd2345_…`**: a fixed prefix, eight characters that identify
  it, and a 43-character secret. The Union shows it once, when it is issued or replaced, and
  stores only a hash. Keep it out of source code, URLs, and logs.
- **It expires after 90 days.** When the Union replaces it, the old token keeps working for an
  overlap agreed with you, so you can switch without an outage.
- **Every credential failure answers the same `401`**: no token, an unknown, revoked,
  replaced, or expired one, a suspended organisation, or a call from outside your allowed
  addresses. A valid token asking for a scope it does not hold answers `403`. Quote the
  `requestId` to the Union to learn which.
- **What a response may carry is set by your disclosure profile**, agreed at approval. A field
  outside it is never sent.

### Login responses are uniform

An unknown account and an incorrect password produce byte-identical responses and take
comparable time. Neither the existence of an account nor a near-miss on a password can be
inferred from a login attempt.

---

## 5. Authorisation

**Every check names a permission, never a role.** Roles are administrative bundles that
confer permissions; code asks whether the caller holds `vehicle.declare`, not whether they
are a Vehicle-Record Officer. A permission held is the unit of authority, and it can be
granted or revoked per user without inventing a role.

A user's effective permissions are:

```
(permissions from assigned roles)  +  per-user grants  −  per-user revocations
```

**Revocation always wins.** Where a permission is both granted and revoked for the same
user in the same scope, it is withheld.

### Scope

Every assignment carries an **organisational scope**: a node of the Council → Zone →
Branch → Unit hierarchy, or the root for Union-wide authority. Holding a permission at a
branch means holding it for that branch and everything beneath it, and for nothing above
it.

Two consequences an integrator will observe:

- A branch administrator's view of the hierarchy has **no council at its head**. The
  hierarchy endpoint returns a forest of the subtrees the caller may read, not the whole
  tree with parts hidden.
- Moving an organisation requires the permission at **both** the origin and the
  destination. A move is simultaneously a removal and an insertion; holding the permission
  at one end only is not sufficient.

### Deny by default

A route carrying neither an explicit permission requirement nor an explicit public
declaration is **refused**, not allowed. Every route declares exactly one of a permission, a
scope, or public access. The public surface is health, login, logout, signed media links,
and the payment provider's webhook, and the test suite fails if another appears.

---

## 6. Errors

Every failure answers in one shape:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "No matching resource was found.",
    "requestId": "5f1c2a90-8f1e-4a0a-9c3a-2a0d6b7c1e44"
  }
}
```

`message` is **deliberately uninformative**. Detail is written to the server log against
`requestId`; quote that identifier when raising a support enquiry.

### Failures are indistinguishable by design

A request that matches no route at all produces the same shape as a request that matched a
route and found nothing, which produces the same shape as a request that was not permitted.
A caller must not be able to tell "no such route" from "no such record" from "not permitted
to see that record", because the differences between those answers are themselves a
description of the record set (PRD Requirement 14.3).

Two corollaries worth stating plainly:

- A record outside the caller's scope answers **404, not 403**. Existence is disclosed only
  within a subtree the caller may already read, so identifiers cannot be enumerated by
  observing which ones return "forbidden".
- A not-found response never indicates that a submitted identifier was close to a valid
  one.

### Validation is the one exception

A rejected request body carries field-level detail:

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "The request could not be processed.",
    "requestId": "…",
    "details": [
      { "field": "name", "message": "A name is required." },
      { "field": "level", "message": "Invalid option" }
    ]
  }
}
```

This does not weaken the rule above. These entries describe the request the caller has just
sent, which the caller already holds. Nothing derived from the database reaches this field.

### Status codes

| Code | Meaning here |
|---|---|
| 200 | Success. |
| 201 | Created. |
| 400 | The body or a parameter failed validation. |
| 401 | No valid session was presented, or on an external route no valid API token. |
| 403 | The session does not hold the required permission in the relevant scope, or the organisation does not hold the scope the route requires. |
| 404 | No such record, **or** it lies outside the caller's scope. |
| 409 | The request conflicts with the record's current state or with a domain rule. |
| 429 | Rate limit exceeded. |
| 503 | The service is degraded. |

---

## 7. Request conventions

- **Content type** is `application/json` on every route accepting a body.
- **Unknown fields are discarded**, not rejected and not stored. A caller cannot set an
  internal field such as `path` or `isActive` by including it in a body that never meant to
  accept it.
- **Strings are trimmed** before validation, so a value of spaces is rejected rather than
  stored blank.
- **`X-Request-ID`** is honoured where supplied and echoed in any error, so a caller's own
  correlation identifier survives into the Union's logs. On the officer routes one is minted
  where absent. **On the external routes it is required** (§10.1).
- **Identifiers are UUIDs.** A malformed identifier answers 400 without a database query.

### Changes that require a reason

Moving an organisation, and activating or deactivating one, require a `reason` in the body.
So do every card status change, every card replacement, and withdrawing an officer
signature. It is recorded in the audit trail with the before and after values. These are
actions whose motivation is not recoverable after the fact, and the Union's own governance
depends on being able to reconstruct why a unit was dissolved, a branch reassigned, or a
member's card cancelled.

### Documents

Two routes return a PDF rather than JSON: `GET /cards/{id}/document` and
`GET /applications/{id}/form`. Both are `application/pdf`, `Cache-Control: no-store`, and
carry a `Content-Disposition` filename — an issued card by its card number, an unissued one
by nothing identifying, and a registration form by its application number.

**They are fetched with credentials, not linked to.** The session cookie belongs to the
API's origin; a cross-site top-level navigation does not carry a `SameSite=Lax` cookie, so a
plain link would answer 401. Fetch the document and save the blob.

---

## 8. Membership cards

The card surface has three properties an integrator or operator will meet immediately.

**A card number exists only after issuance.** `cardNumber` is `null` on a card in `DRAFT` or
`PENDING_APPROVAL`. A number identifies a card that was printed; a cancelled draft was never
printed and is in nobody's pocket, so allocating one earlier would put an identifier in the
register that names no artifact.

**An unissued card renders as a proof.** `GET /cards/{id}/document` on a card that has not
reached `ISSUED` returns a PDF with no card number and a diagonal `PROOF — NOT ISSUED`
overprint. This is not a formatting nicety: without it a printed draft would be
indistinguishable from the article, and the approval step would be decorative.

**The printed values are a snapshot.** The `printed` object on a card detail is what was
composited when the card was issued, not what the member record says now. A member who
transfers between branches keeps the card in their pocket, and the System must describe that
card rather than a card that would be printed today.

### Which permission does what

| Act | Permission |
|---|---|
| Prepare, amend, submit for approval; record collection | `card.issue` |
| Approve for issuance, or return for amendment | `card.approve` |
| Replace | `card.replace` |
| Suspend, restore, report lost, expire, cancel | `card.suspend` |
| Read, list, render | `card.read` |
| Register or withdraw an officer signature | `card_template.manage` |

`card.issue` and `card.approve` are separate deliberately: the officer who prepares a card
cannot approve their own preparation. Recording collection (`ISSUED → ACTIVE`) is part of
issuing rather than of suspending, so it has its own route — otherwise whoever may suspend a
card could also complete an issuance nobody authorised them to complete.

### Statuses

Nine, per PRD §8. Two distinctions matter:

- **`ISSUED` is not `ACTIVE`.** An issued card has been printed but not handed over. It
  occupies its holder's one live-card slot — a card lost between the printer and the counter
  is exactly as dangerous as one lost afterwards — but it does not verify.
- **`LOST` and `EXPIRED` never return to `ACTIVE`.** A card reported lost may be in somebody
  else's pocket, and restoring it would revalidate whatever is out there. A card found again
  is replaced, not resurrected.

A replacement is a **new card in `DRAFT`** pointing back at the original, which moves to
`REPLACED`. It still requires approval before it is issued, so `card.replace` cannot mint
credentials on its own.

---

## 9. Auditing

Create, update, approve, issue, suspend, replace, look up, export, and override all emit
audit events carrying before and after values, the acting user, and the request identifier.
Audit events are written **inside the same database transaction as the change they
describe**, so the trail cannot record a change that was rolled back, nor miss one that was
committed.

---

## 10. External verification

Four routes, each needing its own scope. Each is a `POST` with a JSON body, so an identifier
never travels in a URL.

| Route | Scope | Body |
|---|---|---|
| `/api/v1/verification/vehicle/plate` | `vehicle:verify:plate` | `{ "plate_number": "ABC 123 XY" }` |
| `/api/v1/verification/sticker/qr` | `sticker:verify:qr` | `{ "sticker_qr_id": "…" }`, what the sticker's QR code holds |
| `/api/v1/verification/vehicle/combined` | `vehicle:verify:combined` | both of the above |
| `/api/v1/verification/membership` | `member:verify:membership` | `{ "number": "…" }`, a card or membership number |

Every answer is a `200`. A match names the record and carries the fields your disclosure
profile permits, of those the check may carry:

```json
{
  "request_id": "8f3e0d9e-7f5c-4e0c-a4b1-5b9a0fcb6b5e",
  "result": "MATCH_FOUND",
  "record_type": "NURTW_VEHICLE",
  "statement": "A matching NURTW vehicle record was found under the requested verification criteria.",
  "plate_number": "ABC-123-XY",
  "vehicle_category": "Shuttle bus",
  "sticker_status": "ACTIVE",
  "organizational_unit": "…",
  "limitation": "A match confirms only that an NURTW record exists under the criteria checked. It is not evidence of ownership, roadworthiness, licensing, or insurance.",
  "verified_at": "2026-10-03T12:00:00.000Z",
  "data_as_of": "2026-10-03T12:00:00.000Z"
}
```

| Check | Fields a match may carry |
|---|---|
| Plate | `plate_number`, `vehicle_category`, `sticker_status`, `organizational_unit`, `attached_at` |
| Sticker | `vehicle_category`, `sticker_status`, `organizational_unit`, `attached_at` |
| Combined | the plate's fields, and `plate_matches_sticker` |
| Membership | `membership_status`, `card_status`, `designation`, `organizational_unit` |

A profile that discloses nothing gives the match and nothing more. A field a match may carry
can still be `null`.

**Every non-match is the same answer**, whatever the reason: no record, a record not in good
standing, a sticker on another vehicle, or a forged code.

```json
{
  "request_id": "…",
  "result": "NO_MATCH_FOUND",
  "statement": "No matching NURTW record was found under the requested verification criteria.",
  "limitation": "…",
  "verified_at": "…",
  "data_as_of": "…"
}
```

Asking again will not give a different answer. Quote the `request_id` to the Union instead:
it is the `X-Request-ID` you sent, or one the System minted. A `400` means the body failed
validation, such as a plate that cannot be a plate or a number whose check character is
wrong; its `details` describe only your request.

### 10.1 Request ids, limits, and pauses

**Send your own `X-Request-ID`** on every external request: 1 to 200 printable characters,
with no spaces. A request without one answers `400`, with `details` naming the header, and
spends none of your limits. Every answer, refusals included, carries the System's own id in
`X-Server-Request-ID`. Quote both when you contact the Union.

**Limits apply to your organisation**, across all its tokens. The Union sets them on a limit
profile and may change them at any time:

| Limit | Approved client | Trusted operational client |
|---|---:|---:|
| Checks a minute | 30 | 120 |
| Totals a minute | 2 | 5 |
| Burst | 5 | 20 |
| Daily quota, from midnight in Lagos | 1,000 | 5,000 |

Over a limit, the answer is `429` with `Retry-After` in seconds. Wait that long. A refused
request is not counted against a quota.

**Checks that follow a pattern pause your organisation**: forged sticker codes, plates or
sticker numbers in sequence that match nothing, or a run of checks that mostly match
nothing. While paused, every request answers `429`, with `Retry-After` giving the time left.
The Union is told, and may lift the pause or contact you. Check what you have been asked to
check, as it is presented to you, and nothing else.

---

## 11. Data handling obligations for integrators

- Responses contain only those fields the caller's disclosure profile permits. Fields are
  selected by projection through the profile, never by retrieving a complete record and
  removing fields afterwards.
- Do not log, cache, or forward personal data received from this API beyond the purpose for
  which access was granted.
- Chassis and VIN numbers, guarantor details, next-of-kin details, signatures, and internal
  notes are never reachable through a verification path and must not be requested.

---

## 12. Related documents

| Document | Contents |
|---|---|
| [`openapi.json`](openapi.json) | Generated endpoint reference |
| [`OPERATIONS.md`](OPERATIONS.md) | Running, deploying, and recovering the System |
| [`../../PRD.md`](../../PRD.md) | Authoritative requirements |
| [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) | Numbered design decisions and their reasons |
| [`../../DESIGN.md`](../../DESIGN.md) | Visual identity and verdict legibility |
