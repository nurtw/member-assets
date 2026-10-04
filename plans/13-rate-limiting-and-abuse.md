## Item
13 — rate-limiting-and-abuse

## Source
PRD §14 (Requirements 14.1–14.3), §23.12, proposal §14. `ARCHITECTURE.md` Decisions
8.1–8.3 and 4.1–4.2. Acceptance criteria 7 and 8. Builds on items 11 and 12. Owner
decisions of 3 October 2026: counters in Postgres, daily quotas of 1,000 and 5,000, and an
automatic pause on detection.

## Goal
An organisation that exceeds its limits is refused with `429` and a `Retry-After`. One that
tests identifiers in a pattern is paused for a time, even inside its quota. Every limit and
threshold is a row the Union changes without a release.

## Approach
1. **Domain:** windows, retry times, the sequence rule, and the detection rule, as pure
   functions.
2. **Schema:** `rate_limit_profile` (quotas and detection thresholds), a token bucket and
   counters per organisation, sequence state, and the pause on `api_client`.
3. **Quota layer:** after the token is accepted: pause, bucket (rate and burst), then hourly
   and daily quotas. Limits are per organisation, so two tokens share them.
4. **Detection layer:** after each check: forged codes, sequential plates or codes, and a
   high non-match rate. A signal pauses the organisation and is audited.
5. **Other protections (proposal §14.3):** require `X-Request-ID`, issue a server request
   id, cap the body size, and answer bad JSON with `400`.
6. **Officer routes and screens:** limit profiles, an organisation's profile and quota,
   today's use, and lifting a pause.
7. **Tests and docs.**

## Files likely touched
`packages/domain/src/rate-limit/`, `packages/contracts/src/rate-limit.ts`,
`apps/api/prisma/`, `apps/api/src/rate-limit/`, `apps/api/src/api-client/`,
`apps/api/src/auth/`, `apps/api/src/common/`, `apps/api/test/rate-limit.e2e-spec.ts`,
`apps/web/src/app/(app)/settings/api-access/`, `docs/reference/`.

## Out of scope
A limit by address on requests with no valid token: that belongs at the edge (item 15).
Caching results. A limit on concurrent requests. Totals (item 14).

## Definition of done
- [x] Over the rate, the hourly quota, or the daily quota: `429` with `Retry-After`
      (criterion 7).
- [x] Sequential plates are detected and blocked inside the quota (criterion 8).
- [x] Forged codes and a high non-match rate pause the organisation.
- [x] A pause is audited, shown on the screen, and can be lifted with a reason.
- [x] Every limit and threshold is changed at runtime, audited with a reason.
- [x] An external request without `X-Request-ID` is refused.
- [x] Tests pass; `openapi.json` is regenerated.

**Decided while building (4 October 2026):**

- **Limits are per organisation**, shared by its tokens, so a second token gives no second
  allowance.
- **A refusal is not counted** against a quota, so a client hammering after its limit does
  not push its own reset further away.
- **A match never lengthens a sequence.** A fleet registered together carries plates in
  order and is verified in turn; only non-matching steps count.
- **A pause answers `429` with the time left.** An honest integrator can back off, and an
  abuser learns nothing it would not learn anyway.
- **Pausing clears the evidence**, so lifting a pause does not re-pause on the next check.
- **The request id is checked after the token**, so the refusal is logged against the
  organisation, and before the limits, so it costs nothing.
- **Pauses are rows**, kept after they end, so the history of each organisation shows.
- **New EXT-17:** the detection thresholds are launch defaults. Every one is a number on the
  profile.

**Pending:** not opened in a browser. A limit by address for requests with no valid token
belongs at the edge (item 15).
