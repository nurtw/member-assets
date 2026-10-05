## Item
29 — organisation-portal

## Source
PRD §12, §23.23 (revision 1.9); `QUESTIONS.md` EXT-20, EXT-05, EXT-08. The owner's direction
of 5 October 2026: "an organization should be able to onboard by themselves with a
dashboard of usage also. Admin must approve."

## Goal
An outside organisation applies for access on a public form, signs in to a portal of its
own, and, once the API administrator has approved it, sees its usage and manages its own
tokens. Nothing about who is approved, or what they may see, moves away from the
administrator.

## Approach
1. **Domain:** how the portal classes a request for the organisation (never more than its
   own answers told it), when an application expires, how an applicant is confirmed.
2. **Schema:** `portal_account` and `portal_session`, apart from officers'; on `api_client`,
   whether it applied for itself and how the applicant was confirmed.
3. **A fifth kind of route,** `@PortalAccount()`, read from the portal's own cookie and
   nothing else. An officer's session cannot reach it, and it satisfies no permission.
4. **Applying** (public): one pending organisation and its account. Limited per address,
   capped while pending, expired after 30 days. A repeated email gets the same answer.
5. **Approval** stays `api_client.manage`. For an organisation that applied for itself, it
   also records how the applicant was confirmed: by telephone or by letter.
6. **The portal:** status, scopes, profile, limits; usage by day; create, rotate, and revoke
   its own tokens, shown once to it alone; its own password.
7. **The administrator's side:** see that it applied for itself; give or reset a portal
   account for an organisation, by temporary password.
8. **Screens, tests, docs.**

## Files likely touched
`packages/domain/src/api-client/`, `packages/contracts/src/portal.ts`, `apps/api/prisma/`,
`apps/api/src/portal/`, `apps/api/src/auth/`, `apps/api/src/api-client/`,
`apps/api/test/portal.e2e-spec.ts`, `apps/web/src/app/portal/`,
`apps/web/src/app/(app)/settings/api-access/`, `docs/reference/`.

## Out of scope
Emailed confirmation and password reset (no mail service, GOV-08). A second factor for
portal accounts. More than one account for an organisation. A test environment (EXT-12).

## Definition of done
- [x] An organisation applies, signs in, and sees it is awaiting approval.
- [x] Only `api_client.manage` approves, and a self-application needs the confirmation.
- [x] A portal session reaches no officer route, and an officer's session no portal route.
- [x] An approved organisation makes, rotates, and revokes its own tokens, seen only by it.
- [x] Usage never separates a forged code from any other non-match, or names a reason the
      API withheld.
- [x] The form is limited, capped, and applications expire; every act is audited.
- [x] Tests pass; `openapi.json` is regenerated.

**Decided while building (5 October 2026):**

- **A fifth kind of route**, not an officer account with fewer permissions
  (`ARCHITECTURE.md` Decision 9.16). A portal session can satisfy no permission, whatever
  is later added to the catalogue.
- **Usage is projected** through `portalUsageClass`: a forged code counts as a non-match,
  every credential failure is one refusal, and a pause shows only when it ends.
- **The applicant chooses the portal password when applying.** An account the
  administrator gives or resets starts on a temporary one.
- **One portal account for each organisation.**
- **A lapsed application's account is removed**, so the applicant may apply again. One the
  administrator refuses keeps its account, and sees that it was not approved.
- **The form's limits** are 3 applications an hour from one address and 50 awaiting a
  decision, as settings.
- **The per-address limiter is one shared service** now, used by the pay page too.

**Pending:** not opened in a browser. No second factor for portal accounts. No emailed
confirmation or password reset until a mail service exists (GOV-08).
