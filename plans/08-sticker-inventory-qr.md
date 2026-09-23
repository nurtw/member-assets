## Item
08 — sticker-inventory-qr

## Source
PRD §10 (Requirements 10.1–10.3), §26, §9A.3–9A.5. `StickerStatus` (nine
states) and `Sticker` already exist from item 02, but `vehicleId` and
`plateNumberAtIssue` are `NOT NULL` — the schema assumes a sticker is born
attached, which revision 1.2 forbids (Requirement 10.3).

## Goal
A sticker can exist **unattached** — either freshly signed and unissued, or
a legacy barcode sitting on the imported Transpay register — and attaching
one to a vehicle is a single, recorded, one-shot event. Item 09's migration
and item 17's onboarding both build on this; neither is unblocked without
it.

## Approach
1. Schema: make `Sticker.vehicleId` and `plateNumberAtIssue` nullable; add
   `attachedAt DateTime?` and `registeredPlateNormalized String?` (the plate
   the Transpay register binds a legacy barcode to, distinct from
   `plateNumberAtIssue`, which is set only once actually attached). A
   partial unique index enforces at most one *attached* sticker per vehicle
   at a time, mirroring the declaration's active-plate index.
2. `packages/domain/src/sticker/status.ts` — transition table for the nine
   states, plus a pure `canAttach(sticker, vehicle)` predicate encoding
   Requirement 9A.4's four conditions (register membership, exact plate,
   never-attached, payment reference unused) — kept here so item 17 can
   reuse it without duplicating the rule.
3. `packages/contracts/src/sticker.ts` — issue (new signed sticker,
   unattached), attach (by id or legacy barcode + payment reference), and
   status-transition schemas.
4. `apps/api/src/sticker/` — module, service, controller. `attach()` is
   **not** exposed on this module's own permission alone: it is gated by
   `sticker.attach` (already seeded) and, for a legacy barcode, calls into
   the payments module to confirm the reference before writing — item 17
   owns that orchestration, so this module exposes `attach()` as a service
   method other modules call, not only a route.
5. QR minting: reuse the existing HMAC/opaque-id scheme (§26.1–26.2)
   unchanged; it already never encodes personal data.

## Files likely touched
`apps/api/prisma/schema.prisma` + migration, `packages/domain/src/sticker/`,
`packages/contracts/src/sticker.ts`, `apps/api/src/sticker/*`,
`apps/api/src/app.module.ts`.

## Out of scope
The Transpay register import itself (item 09). Onboarding orchestration —
charging the fee and calling `attach()` together (item 17).

## Definition of done
- [x] An unattached sticker (new or legacy) can exist with no vehicle row.
- [x] Attach is refused on any of Requirement 9A.4's four conditions, each
      audited with its specific reason.
- [x] A sticker attaches at most once in its life; re-attachment attempts
      after that are refused, not silently reassigned.
- [x] `pnpm typecheck` and `pnpm --filter api test` pass (`test/sticker.e2e-spec.ts`,
      9 tests; domain `sticker/*`, 21 tests, including QR signing and
      key-rotation coverage not in the original plan).

## Note on scope actually delivered

Replace/suspend/status-transition routes are not built — `attach()` is the
only mutation this item ships beyond `issue()`. The QR HMAC signing scheme
(§26.1–26.2), left as "reuse the existing" in the plan above, did not
actually exist anywhere in the codebase yet; it is now built in
`packages/domain/src/sticker/qr-signing.ts` plus `StickerService.
mintQrPayload`/`verifyQrSignature`, gated on `STICKER_SIGNING_SECRET` (see
`.env.example`) — unset in this dev environment, so minting/verifying a
real QR will throw until an operator sets it.
