## Item
50 — dedicated-accounts-for-all

## Source
The owner's direction of 18 October 2026 (`QUESTIONS.md` PAY-22): every member gets "a
dedicated account number", created "with their NIN, since most won't have a BVN". Item 23
opens one at a time, by an officer who types in an email. PAY-27 (the NIN, the email) is
open; PAY-20 (no BVN) and PAY-11 (the percentage, still unset) stand. Needs item 44 (the
NIN) and item 45 (to tell the member). **Requirement 27.7 sends Paystack only what it
requires, and PAY-20 collects no identifier, so sending a NIN changes the PRD.**

## Goal
Every active member has a dedicated account without an officer opening each one: on
approval, and in batches for members approved before. The member is told the number by
SMS. Where Paystack needs identification and accepts a NIN, the NIN is sent.

## Approach
1. **On approval**, the account is opened after the decision has committed, never inside
   it: a provider fault must not undo an approval. A failure is recorded, and the batch
   retries it.
2. **A batch** for members already active, started by a holder of `payment.initiate`, for
   the members within their scope: a few accounts at a time, within Paystack's limits,
   resumable after a stop, with a report of each refusal and its reason (no telephone, no
   email, no NIN, refused by Paystack).
3. **The email** Paystack requires, which most drivers do not have, is PAY-27's.
4. **The NIN**, if PAY-27 finds Paystack opens accounts on one: decrypted at the moment of
   opening, sent, and never logged or audited. Otherwise PAY-20 stands.
5. **The member is told** by SMS: "NURTW: your account for dues is 0123456789 (bank). Pay
   by transfer or at any PoS." That serves until a card carries it (item 51).
6. Still refused until the settlement account and the percentage are set (PAY-11), as now.

## Files likely touched
`apps/api/src/payments/dedicated-account.service.ts`, `apps/api/src/membership/` (after
approval), `apps/api/src/payments/paystack/paystack.client.ts`,
`apps/web/src/app/(app)/settings/`, `PRD.md`, `OPERATIONS.md`.

## Out of scope
Closing or replacing an account. Another provider (PAY-16; that needs a PRD revision). A
BVN.

## To settle before building (PAY-27)
- Will Paystack open an account on a NIN, and with what else?
- Which email each member's account is opened with.

## Definition of done
- [ ] Approval opens an account. A provider fault leaves the approval standing and the
      account queued for a retry.
- [ ] A batch opens accounts for active members without one, resumes after a stop, and
      reports each refusal.
- [ ] A NIN, where sent, is in no log, audit event, or error.
- [ ] The member gets the number by SMS.
- [ ] Tried in Paystack's test mode, and then on one live account, before the batch runs
      live.
