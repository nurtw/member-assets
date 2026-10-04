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
- [ ] Over the rate, the hourly quota, or the daily quota: `429` with `Retry-After`
      (criterion 7).
- [ ] Sequential plates are detected and blocked inside the quota (criterion 8).
- [ ] Forged codes and a high non-match rate pause the organisation.
- [ ] A pause is audited, shown on the screen, and can be lifted with a reason.
- [ ] Every limit and threshold is changed at runtime, audited with a reason.
- [ ] An external request without `X-Request-ID` is refused.
- [ ] Tests pass; `openapi.json` is regenerated.
