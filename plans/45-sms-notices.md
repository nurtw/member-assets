## Item
45 — sms-notices

## Source
The owner's direction of 18 October 2026 (`QUESTIONS.md` PAY-22): each payment is confirmed
to the member with "the amount and what's left for the month", and members learn one rule,
no message, not paid. The owner: "focus on SMS first instead of calls … no calls for now"
(GOV-23, deferred). GOV-22 (provider, sender name, cost, languages) is open. **Changes the
PRD:** Requirement 27.14 defers SMS receipts, and Requirement 27.8 shows dues on internal
screens only. Waits for the owner's approval.

## Goal
The System can send an SMS to a member's registered telephone, reliably and on the record.
Its first message confirms money credited to the member: how much, and what is still to pay
this month. Nothing is sent until it is switched on.

## Approach
1. **One interface, one adapter.** An `SmsSender` interface in a new `notifications`
   module. Only its adapter knows the provider GOV-22 settles on, as only `PaystackClient`
   knows Paystack (PAY-16). A local stand-in serves tests and click-throughs, as the
   Paystack stand-in does.
2. **An outbox, written in the same transaction as the credit** (`sms_message`: member,
   purpose, number, text, template version, status, attempts, the provider's id). A sender
   drains it with retries, and the provider's delivery reports update it. So a credit is
   never left unannounced because the provider was down, and nothing is sent for a credit
   that rolled back.
3. **The first message**, on each dedicated-account transfer credited (item 23's
   `receive`), and on each collection once item 47 exists. For example: "NURTW: N2,000
   received for member <number> on 18 Oct. Still to pay this month: N5,000." What is still
   to pay is what the member owes once the credit is allocated
   (`DuesService.memberOutstanding`).
4. **Texts are data**, versioned, so the Union's wording changes without a deploy. English
   first; another language only in words the Union supplies, never machine-translated.
   Amounts are written "N2,000": the naira sign is outside the SMS character set, and
   would double the cost of every message.
5. **What a message never carries:** a NIN, an address, a whole telephone number, a next of
   kin or guarantor, a chassis number, or a link. A test fails if a template can.
6. **Settings:** `sms.enabled` (off), the sender name, and quiet hours for reminders
   (item 49). A confirmation goes at once.
7. **Officers see what was sent.** The member's record lists each message's purpose, time,
   and status, and can send the last confirmation again. If no message means not paid, a
   lost one becomes a dispute at the park.
8. Telephone numbers are put into international form when sent. One that cannot be read is
   recorded as unsendable, never guessed.
9. PRD Requirements 27.8 and 27.14, `ARCHITECTURE.md` §4 (the new module), `CLAUDE.md`,
   `OPERATIONS.md`.

## Files likely touched
`apps/api/src/notifications/` (new), `apps/api/src/payments/dedicated-account.service.ts`,
`apps/api/prisma/schema.prisma` and a migration, `packages/contracts/src/`,
`apps/web/src/app/(app)/members/[id]/`, and the documents above.

## Out of scope
Voice calls (GOV-23). Reminders (item 49). Messages to officers or organisations. Replies.
WhatsApp.

## To settle before building (GOV-22)
- Which provider, and the sender name to register with it. Registering takes time.
- Who pays for each message.
- Which languages, and who writes and approves each text.

## Definition of done
- [ ] A credited transfer queues one message in its own transaction. A rollback queues
      none, and a replayed webhook queues no second.
- [ ] A failed send is retried and delivery is recorded. Nothing is sent while switched off.
- [ ] No template can carry a NIN, an address, or a whole telephone number.
- [ ] An officer sees what was sent to a member and can send a confirmation again.
- [ ] PRD revised. Every test passes; clicked through against the stand-in.
