## Item
15 — go-live-hardening

## Source
PRD §17–18 (Requirement 17.2), §21 (the acceptance criteria), §14.3; proposal §17.
`ARCHITECTURE.md` Decisions 10.4, 12.1. Owner decisions of 4 October 2026: engineering
first; the API on DigitalOcean; no database lock on audit events yet. Follows item 28, which
took the officer accounts and multi-factor sign-in this plan first listed.

## Goal
Everything engineering can do before production accounts and the Union's answers exist is
done and tested, and what remains is a short list the owner can act on.

## Approach
Engineering first, in parts, each committed on its own:

1. **Request hardening** (proposal §14.3): security headers, an explicit body-size cap, and
   a generic `400` for malformed JSON.
2. **Continuous integration:** lint, typecheck, unit, and end-to-end tests on every push.
3. **The container:** a Dockerfile and a DigitalOcean app spec; the Render keep-warm
   workflow goes.
4. **Backup and restore:** scripts, and a rehearsal timed against a scratch database.
5. **Monitoring:** an authenticated diagnostics route, and what to alert on.
6. **The incident-response document.**
7. **The acceptance criteria:** each of the 18 mapped to the test that proves it.

Then, needing the owner: production provisioning, domains, alert destinations, turning the
second-factor requirement on (GOV-18), and the Union's open answers.

## Files likely touched
`apps/api/src/main.ts`, `apps/api/src/common/`, `.github/workflows/`, `apps/api/Dockerfile`,
`.do/`, `apps/api/scripts/`, `docs/reference/`.

## Out of scope
Locking audit events in the database (the owner: not yet). A limit by address at the edge,
until a host exists. Anything deferred by the Union (GOV-04).

## Definition of done
- [ ] Malformed or oversized bodies answer the generic error, never a stack or HTML.
- [ ] CI runs the whole test suite.
- [ ] The API builds and starts from its container.
- [ ] A backup is restored into a scratch database, and the time taken is recorded.
- [ ] Each acceptance criterion names a passing test, or says what is missing.
- [ ] The incident document and runbook say who does what, with open contacts marked.
