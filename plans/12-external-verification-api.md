## Item
12 — external-verification-api

## Source
PRD §11, §12 (Requirements 12.2, 12.3, 12.7), §14.3, §15, §22, §26.1. `ARCHITECTURE.md`
Decisions 5.1–5.4 and 9.10–9.11. Acceptance criteria 6, 12, 15. Builds on items 10, 11, 24.

## Goal
An approved organisation checks a plate, a sticker, both together, or a membership number
with its token. A match carries only the fields its profile and that check allow. Every
non-match gets the same answer, whatever the reason. Each request is logged, and each check
is audited against the organisation.

## Approach
1. **Shared lookups:** move the record reads out of the internal services into a read-only
   `VerificationRecordsService`, so both channels decide from the same facts.
2. **Domain:** the fields each external check may carry, and its record type. A sticker
   check never carries the plate (proposal §10.2).
3. **Contracts:** request bodies in the proposal's names (`plate_number`, `sticker_qr_id`,
   `number`), and the response type.
4. **API:** the four routes of proposal §12.3 under `@RequireScope`. A 200 with
   `MATCH_FOUND` or `NO_MATCH_FOUND`. A signed code is checked first; a failure is a
   no-match, audited as a forgery attempt.
5. **Logging:** an interceptor writes one `api_request_log` row for each request that passes
   the guard, with its outcome and identifier scheme.
6. **Tests:** domain units; e2e for each profile, identical negatives, scope per route, the
   log, the audit, and read-only.

## Files likely touched
`packages/domain/src/verification/external.ts`, `packages/contracts/src/verification.ts`,
`apps/api/src/verification/`, `apps/api/src/api-client/`,
`apps/api/test/external-verification.e2e-spec.ts`, `docs/reference/`.

## Out of scope
Rate limits and the other protections of proposal §14.3, such as requiring a client
request id (item 13). No real organisation should hold a token before then. Totals
(item 14). The usage and metadata endpoints. The public QR page (EXT-09, GOV-08).

## Definition of done
- [x] Each route answers only with its scope, and only by token.
- [x] A Minimal-profile client gets no record field (criterion 6).
- [x] Every non-match is identical apart from its request id and times.
- [x] No response carries a restricted value, declaration, or dues (criteria 12, 15).
- [x] One log row and one audit event per check; neither holds the token.
- [x] Nothing else is written.
- [x] Tests pass; `openapi.json` is regenerated.

**Decided while building (3 October 2026):**

- **A non-match is a 200, not a 404.** The request succeeded and the answer is no. A 404
  would read as a missing route.
- **A combined mismatch is an ordinary non-match.** Proposal §10.2 would say whether the
  sticker belongs to the plate, but Decision 5.4 rules out a distinct negative, so
  `plate_matches_sticker` appears only on a match, as `true`.
- **A sticker check never carries the plate**, even where the profile permits it.
- **A plate still matches once its sticker is lost**: VEH-22's rule needs the vehicle
  onboarded, not its sticker active. The match then shows `sticker_status: LOST`.
- **The audit event names the organisation and the fields disclosed**, so the Union can say
  who was told what about a vehicle or member.
- **Requiring a client request id** (proposal §14.3) moves to item 13 with the other §14.3
  protections.
- **New EXT-13:** an outside membership check carries no name, so it cannot catch a genuine
  number on someone else's card.

**Pending:** no rate limit until item 13. Not opened in a browser (nothing to open).
