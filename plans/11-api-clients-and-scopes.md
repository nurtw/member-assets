## Item
11 — api-clients-and-scopes

## Source
PRD §12.1–12.2, Requirements 12.1–12.2, 12.4, 12.6, 12.8–12.10, §15, §16, §23.10–23.12,
§23.23. `ARCHITECTURE.md` Decisions 5.1–5.3, 9.1, 9.8. Acceptance criterion 11.

## Goal
The Union registers an outside organisation, approves it with a disclosure profile and
scopes, and issues it a token it can replace or withdraw. A token authenticates a request
to a route that names a scope, and nothing else. Disclosure profiles are rows the Union
can add to without a release.

## Approach
1. **Domain, pure:** the client lifecycle and what state a token is in; whether an address
   falls in an allowed range; which catalogue fields an outside profile may name.
2. **Contracts:** zod schemas for registering, approving, amending, and rotating; a
   description for every scope; the four seeded profiles.
3. **Schema:** the agreement, the approval record, and a named technical contact on
   `api_client`; rotation and last use on `api_token`; the token and address on
   `api_request_log`. The migration seeds the profiles.
4. **`disclosure` module:** list, create, and amend profiles. A profile names only
   external-admissible fields. Seeded profiles cannot be changed.
5. **`api-client` module:** register, amend, approve, change access, suspend, reinstate,
   revoke; issue, rotate, and revoke tokens. Every act is audited.
6. **Authentication:** `@RequireScope` beside `@RequirePermission`. The one global guard
   sends a scope route to the token path and every other route to the session path.
7. **Web:** an API access area: organisations, one organisation, disclosure profiles.
8. **Tests:** domain and contract units; e2e through a probe route.

## Files likely touched
`packages/domain/src/api-client/`, `packages/domain/src/network/`,
`packages/contracts/src/{api-client,disclosure,scopes}.ts`, `apps/api/prisma/`,
`apps/api/src/{api-client,disclosure,auth,docs,common,settings}/`,
`apps/api/test/api-client.e2e-spec.ts`, `apps/web/src/app/(app)/settings/`.

## Out of scope
The verification endpoints and how a response is projected (item 12). Rate limits, quotas,
and limit profiles (item 13). Reminder emails, until a mail service and the domains exist.
A test environment for outside organisations (EXT-12).

## Definition of done
- [x] An organisation is registered pending, and approved only with an agreement, a
      profile, and at least one scope.
- [x] A token is shown once, stored as a hash, and never returned, logged, or audited.
- [x] Revoking a token, or suspending or revoking its organisation, takes effect on the
      next request (criterion 11).
- [x] A rotated token keeps working for the overlap the officer chose, and no longer.
- [x] A session never satisfies a scope route, and a token never satisfies a permission
      route.
- [x] No broad scope can be granted, and no profile can name an internal-only field.
- [x] Tokens expiring within the reminder window are flagged.
- [x] Unit and e2e tests pass (api-client suite 61/61). `openapi.json` is regenerated.

**Decided while building (3 October 2026):**

- **`EXPIRED` is worked out, never stored**, from the token dates, as "onboarded" is.
- **One token in use per organisation.** A second is refused; replacing it is rotation.
  Revoking an organisation revokes every token in the same transaction; suspending keeps
  them, so reinstating restores access.
- **Every bad credential answers the same 401.** Only a valid token without the scope gets
  403. The reason goes to `api_request_log`, which item 12 also writes each outcome to.
- **Anything shaped like a token is redacted** from logged URLs, though a token is read only
  from the `Authorization` header.
- **The seeded Membership profile omits the designation**, which proposal §15 gives "if
  approved". The Union can compose a profile with it. PRD §15's Internal profile is no row.
- **Columns never written before were reshaped:** the technical contact became a name, an
  email, and a phone; `sponsor_user_id` became `approved_by_user_id`.
- **An address range with a prefix of 0 is refused**, since it restricts nothing.

**Pending:** not opened in a browser, as the owner directed.
