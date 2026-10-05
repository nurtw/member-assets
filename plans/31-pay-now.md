## Item
31 — pay-now

## Source
PRD Requirement 27.8 (revision 1.9); `QUESTIONS.md` PAY-21. Approved by the owner on
5 October 2026, after item 30 and before item 15.

## Goal
Wherever an officer sees what is owed, one button gets the payer paying: a personal pay
link (QR code, link, WhatsApp, SMS), the exact-amount link, and the member's dedicated
account. Anyone holding a pay link can pay published amounts on a public page that never
says what is owed or paid.

## Approach
1. **Domain:** what a pay link offers (a vehicle the monthly levy, a member the yearly
   fee), the label it shows, and the code's shape.
2. **Schema:** `pay_link` (code, subject, who created it, revoked when, by whom, why), with
   one live link per subject as a partial unique index. Links are replaced, never deleted.
3. **Officer routes** (`payment.initiate` over the subject's organisation): get or create a
   subject's link; replace it with a reason. Both audited.
4. **Public routes** (`@Public()`, payments module): `GET /pay/:code` (label and options);
   `POST /pay/:code` (fee and payer email, answers a Paystack URL). Unknown or replaced
   codes answer the generic 404. The return address must be on the web's own origin.
   Limited per address by settings. The payment records no officer.
5. **Web:** a public `/pay/[code]` page; a Pay now panel (QR code, copy, WhatsApp, SMS,
   replace; exact-amount link; dedicated account) on the Verify page and in every dues
   panel.
6. **Tests and docs:** status-blind answers for an owing and a paid-up vehicle; scope;
   replacement; limits; the public-route pin; `OPERATIONS.md`, `CLAUDE.md`, `openapi.json`.

## Files likely touched
`packages/domain/src/payments/`, `packages/contracts/src/payments.ts`, `apps/api/prisma/`,
`apps/api/src/payments/`, `apps/api/test/pay-links.e2e-spec.ts`, `apps/api/test/openapi.e2e-spec.ts`,
`apps/web/src/app/pay/`, `apps/web/src/components/`, `apps/web/src/app/(app)/verify/page.tsx`.

## Out of scope
The public sticker page (§23.13, waits on GOV-08). Sending messages from the System (no SMS
or mail service). Paying several months in one payment.

## Definition of done
- [x] An officer gets a vehicle's or member's pay link, as a QR code and a link, from the
      Verify page and the dues panels.
- [x] The public page answers identically for a vehicle that owes and one that is paid up.
- [x] A replaced link stops working at once; the old one is kept, with who and why.
- [x] A payment made from a link is confirmed and credited like any other.
- [x] The public routes are limited per address, and no response names a dues status.
- [x] Tests pass; `openapi.json` is regenerated.

**Decided while building (5 October 2026):**

- **A pay link's code is stored as it is**, since it is not a credential (`ARCHITECTURE.md`
  Decision 9.15). It stays out of audit events and logged URLs all the same.
- **A member is named on the public page by first name and membership number**, and nothing
  else of them.
- **The limits are 30 views a minute and 10 payments an hour per address**, as settings.
- **`PaymentsService.quote` prices a fee for both the page and the payment.**
- **The officer's button shows wherever the dues do.** The public page is the same whatever
  the subject owes.

**Pending:** not opened in a browser, and not tried against Paystack. WhatsApp and SMS open
on the officer's own device: the System sends nothing.
