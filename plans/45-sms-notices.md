## Item
45 — sms-notices

## Source
The owner's direction of 18 October 2026 (`QUESTIONS.md` PAY-22): each payment is confirmed
to the member with "the amount and what's left for the month", and members learn one rule,
no message, not paid. The owner: "focus on SMS first instead of calls … no calls for now"
(GOV-23, deferred). GOV-22 is answered: Termii, the sender name "NURTW", paid for by the
Union, and English first. **Changes the PRD:** Requirement 27.14 defers SMS receipts, and
Requirement 27.8 shows dues on internal screens only. Waits for the owner's approval.

## Goal
The System can send an SMS to a member's registered telephone, reliably and on the record.
Its first message confirms money credited to the member: how much, and what is still to pay
this month. Nothing is sent until it is switched on.

## Approach
1. **One interface, one adapter.** An `SmsSender` interface in a new `notifications`
   module, and an adapter for Termii (GOV-22), the only code that knows the provider, as
   only `PaystackClient` knows Paystack (PAY-16). Termii's key comes from the environment
   and, like Paystack's, never reaches a log, an error, or the web. A local stand-in serves
   tests and click-throughs, as the Paystack stand-in does.
2. **An outbox, written in the same transaction as the credit** (`sms_message`: member,
   purpose, number, text, template version, status, attempts, the provider's id). A sender
   drains it with retries, and the provider's delivery reports update it. So a credit is
   never left unannounced because the provider was down, and nothing is sent for a credit
   that rolled back.
3. **The first message**, on each dedicated-account transfer credited (item 23's
   `receive`), and on each collection once item 47 exists. For example: "NURTW: N2,000
   received for member <number> on 18 Oct. Still to pay this month: N5,000." What is still
   to pay is what the member owes once the credit is allocated
   (`DuesService.memberOutstanding`). A member with no vehicle owes no month, so their
   message says what is left of the yearly fee instead (PAY-25).
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

## Settled (GOV-22, 18 October 2026)
- **Termii**, with the sender name "NURTW". The owner registers the name with Termii, which
  takes time, and provides the account's key.
- **The Union pays** for each message.
- **English first.** Another language comes later, in words the Union writes and approves.

## Definition of done
- [x] A credited transfer queues one message in its own transaction. A rollback queues
      none, and a replayed webhook queues no second.
- [x] A failed send is retried and delivery is recorded. Nothing is sent while switched off.
- [x] No template can carry a NIN, an address, or a whole telephone number.
- [x] An officer sees what was sent to a member and can send a confirmation again.
- [x] PRD revised (1.18). Every test passes; clicked through against the stand-in,
      18 October 2026.

**Decided while building (18 October 2026):**

- **Link payments are confirmed too**, not only dedicated-account transfers: a membership
  fee or a levy confirmed by `PaymentsService.settle`. Tomorrow's payments are links, and
  "no message, not paid" must hold for them. A levy goes to the member who drives the
  vehicle (`declaredByMemberId`); a sticker fee sends nothing.
- **The text is made up when the message goes**, not when it is queued, so what is owed is
  read from committed state. The outbox row holds the source, not the words, until then.
- **While switched off, a queued message is marked not sent**, never held back: switching
  on sends no backlog of old receipts. A message not sent within a day expires.
- **The amount is what the member paid** (a link's total, a transfer's whole amount), as
  their bank or Paystack showed it, and what is owed is what remains after the credit.
- **The whole number is not stored**: read from `member_contact` when the message goes,
  with only the last four digits kept.
- **A test message** goes at once to a typed number, whether or not messages are on, so
  the key, the sender name, and the route are proved first.
- **The route is a setting** (`dnd` or `generic`): Termii must switch the DND route on for
  the account, and the generic route serves until it does.
- **Termii's base URL is the account's own** (its dashboard), so it is configuration, not a
  constant. Delivery reports are signed HMAC-SHA512 under the secret key; Termii does not
  say hex or base64, so both are accepted.
