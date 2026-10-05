## Item
33 — organisations-and-invitations

## Source
The owner's direction of 5 October 2026: "we need to have organizations page and also be
able to share a link for an organization to onboard." PRD Requirement 12.11 and §23.23
(revision 1.10); `QUESTIONS.md` EXT-21, answered the same day: a personal link for each
invitation. Builds on items 29 and 32.

## Goal
Outside organisations have a page of their own in the sidebar, in place of Settings → API
access. An administrator invites an organisation by a link (copied, shared to WhatsApp or
SMS, or shown as a QR code) that opens the application form already addressed to it. What
follows is unchanged: the applicant is confirmed by telephone or letter, then approved.

## Approach
1. **Domain:** an invitation is open, used, expired, or withdrawn, worked out from its
   dates and never stored, as a token's expiry is.
2. **Schema:** `portal_invitation` (the organisation's name; an optional contact name,
   email, and phone; a note; the code; the expiry; when it was used, and by which
   application; when it was withdrawn, by whom, and why; who created it), and
   `api_client.invitation_id`. The code is 16 random bytes, base64url. It is not a
   credential, as a pay link's is not (Decision 9.17, after 9.15): it is stored as it is,
   kept out of audit events, and removed from logged URLs.
3. **Routes.** Under `api_client.manage`: create, list, and withdraw with a reason. Public:
   `GET /portal/invitations/:code` gives the organisation's name and the expiry, or one
   answer for unknown, used, expired, and withdrawn alike, limited per address.
   `POST /portal/applications` takes an optional code: an open invitation is used in the
   same transaction, and any other code is ignored. An invitation lifts no limit and skips
   no confirmation.
4. **Settings:** `portal.invitation_expiry_days` (14), `portal.invitation_views_per_minute`
   (30).
5. **Organisations** (`/organisations`): search; filters for awaiting a decision, active,
   suspended, withdrawn, and paused; a strip of what needs attention; tabs for
   Organisations and Invitations. **Invite organisation** opens a dialog that returns the
   link with Copy, Share (the phone's share sheet), a QR code, a message ready to send, and
   the expiry date. The open form's general link is offered there too.
6. **One organisation** (`/organisations/[id]`): tabs for Overview, Access, Tokens, Usage,
   Limits, and Portal account, splitting today's 1,405-line page into parts. Usage shows
   what the organisation sees in its portal, through an officer route over the portal's
   projection. Disclosure profiles and Limits become sub-pages. The old addresses
   redirect.
7. **The application form** reads `?invite=`, says the Union invited the organisation, and
   fills in its name. The administrator sees who invited it.
8. **Docs:** EXT-21's "Built as", Decision 9.17, `CLAUDE.md`, `API.md`, `OPERATIONS.md`,
   `openapi.json`. The pinned public list grows by one route.

## Files likely touched
`packages/domain/src/api-client/invitation.ts`, `packages/contracts/src/portal.ts`,
`apps/api/prisma/`, `apps/api/src/portal/`, `apps/api/src/api-client/`,
`apps/api/src/common/request-logging.middleware.ts`,
`apps/api/test/portal-invitations.e2e-spec.ts`, `apps/api/test/openapi.e2e-spec.ts`,
`apps/web/src/app/(app)/organisations/`, `apps/web/src/app/portal/(public)/apply/`,
`apps/web/next.config.ts`, docs.

## Out of scope
Emailing an invitation (no mail service until GOV-08). An invitation that replaces the
telephone or letter confirmation, or lifts a limit. More than one portal account.

## Definition of done
- [x] Organisations is in the sidebar, and the old addresses redirect.
- [x] An administrator creates an invitation, then copies it, shares it, or shows its QR
      code. It expires, it can be withdrawn with a reason, and each act is audited without
      the code.
- [x] The link opens the form with the name filled in and is used once. The application
      shows who invited it.
- [x] An unknown, used, expired, or withdrawn code gets the same answer, and viewing is
      limited per address.
- [x] Approving an invited application still needs the confirmation.
- [x] Tests pass, `openapi.json` is regenerated, and it is clicked through in both themes.

**Decided while building (5 October 2026):**

- **The officers' routes are `/organisation-invitations`**, apart from `/api-clients`, so no
  address there can be taken for an organisation's id. Reading needs `api_client.read`;
  inviting and withdrawing need `api_client.manage`.
- **The invitation records its own use** (`used_at`, `api_client_id`), set by one
  conditional update inside the application's transaction. Two applications arriving on one
  link at the same moment cannot both claim it. The plan had the organisation pointing at
  the invitation instead.
- **A closed link still lets the organisation apply**, uninvited, and the form says so.
- **Usage for the administrator is a new read-only route**, `GET /api-clients/:id/usage`,
  over the portal's own projection.
- **One organisation's page is seven tabs:** Overview, Approve (Access once approved),
  Tokens, Usage, Limits, Portal account, and Settings. The open tab is in the address. The
  notices about its standing stay above the tabs.
- **Registering directly has a page of its own** (`/organisations/new`).
- **Sending is from the officer's own apps:** copy, WhatsApp, SMS, email, or the QR code.
  The System sends nothing.
- **The migration is on Neon** (26 migrations, no drift).

**Clicked through (5 October 2026)** on the local stack with synthetic names: the old
address redirecting; inviting, and the link with its QR code and ways to send; the form
addressed to the organisation; the application listed as invited; approval refused until
the applicant is confirmed, then given; every tab, and a reload keeping the tab; a used
link saying so; withdrawing with a reason; search and filters; both themes, and a phone. No
contrast failure. The first run found one fault, since fixed: an empty name showed the
validator's own wording.

**Not clicked through:** the WhatsApp, SMS, and email buttons beyond their addresses (they
open the officer's own apps), an expired link (the tests cover it), and the per-address
limit on a link's page (the tests cover it).
