## Item
23 — dedicated-accounts

## Source
PRD Requirement 27.7, 27.5, 27.9, 27.11; §23.20. `QUESTIONS.md` PAY-06, PAY-11, PAY-12,
PAY-17. Builds on item 22's dues schedule.

## Goal
An officer assigns an approved member a Paystack dedicated account, settling to the NURTW
subaccount. Money the member sends to it is confirmed with Paystack and credited net of
the split. It pays the member's oldest outstanding dues first, across the membership fee and
the levy on their vehicles, and the remainder is held until the next due falls. The member
can be told the exact amount to send.

## Approach
1. **Domain, pure** (`packages/domain/src/payments/`):
   - `allocateCredit` walks outstanding dues oldest first, with a tie-break, and pays each
     in full or in part. The order is a setting (PAY-12); `OLDEST_FIRST` is the answer and
     the default.
   - `dedicatedCreditKobo` and `amountToSendKobo` convert between what is sent and what
     NURTW receives at the contractor's percentage.
   - `membershipCover` takes amounts. A year starts on the day the full fee has been
     received, so a part payment is held toward it. A link payment pays in full, so it
     behaves as before.
2. **Schema:**
   - `dedicated_account`: member, Paystack customer and account ids, number, name, bank,
     and who assigned it. A partial unique index allows one active account per member.
   - `dedicated_account_transfer`: append-only. Paystack reference (unique), amount sent,
     credit, and the basis for the credit.
   - `payment.dedicated_transfer_id`: each allocation is a `DEDICATED_ACCOUNT` payment for
     one due period, with a ledger credit, so item 22 reads it unchanged.
3. **Settings:**
   - `payments.dedicated_account.contractor_percentage` is unset until PAY-11 pricing is
     confirmed, and assignment is refused until then. It is set through a route with
     `payment.manage_settlement`, a password, and a reason, which updates the subaccount's
     `percentage_charge` at Paystack.
   - `payments.dedicated_account.allocation_order` holds the allocation order.
   - The env var `PAYSTACK_DVA_PREFERRED_BANK` is `test-bank` in test mode.
4. **API:**
   - `GET /members/:id/dedicated-account` (`payment.read`, scoped) returns the account,
     held credit, recent transfers with their allocations, whether it can be assigned (and
     why not), and the amounts to send.
   - `POST` (`payment.initiate`, scoped) creates the Paystack customer (email, name, phone
     only) and the account.
   - The webhook passes `dedicated_nuban` charges to `receive`. That re-verifies with
     Paystack, credits `fees_split.subaccount` (or the percentage when it is absent), and
     allocates under a row lock. A replay changes nothing. Unmatched or refused transfers
     are audited.
   - An hourly sweep applies held credit as new dues fall.
5. **Web:** a dedicated-account panel beside the member dues panel.
6. **Tests:** domain units; e2e with Paystack stubbed and the signature check real.

## Out of scope
Deactivating or reassigning an account; refunding dedicated-account money; receipts (not
built for links either); a web page for the settlement settings; requery of missed
transfers.

## Definition of done
- [x] Assignment is refused unless the member is active, has a phone on record, and the
      settlement account and percentage are set. Paystack receives only email, name, and
      phone. A Paystack refusal is audited and answers 502.
- [x] A signed `dedicated_nuban` charge is re-verified, credited net, and allocated oldest
      first across membership and levy. A replay changes nothing. Two transfers at once
      cannot pay one month twice. An unmatched or unconfirmed transfer is audited.
- [x] Held credit pays the next month once it falls; a second sweep does nothing.
- [x] The percentage route needs a password, audits failures, and updates the subaccount.
- [x] Domain 275, contracts 31, api 125; typecheck and lint clean; e2e 202/203 locally
      (dedicated 13/13; the one failure is the known `DEMO_` designations test).
      `openapi.json` regenerated; the migration is on Neon.

**Decided while building (2 October 2026):**

- **A membership year starts on the day the whole fee has been received.** Oldest-first
  can pay part of a fee, so `membershipCover` now adds payments up. A link always pays the
  whole fee, so links behave exactly as before. Each payment is priced on the day it was
  started, so a link started before a price rise still pays in full. Noted under PAY-18.
- **Allocations are payments, one per due period**, with `duePeriod` recorded for a future
  receipt. Their reference is the transfer's with `:n` appended. What a transfer still
  holds is derived (credit less its payments), never stored.
- **Credit is Paystack's `fees_split.subaccount`** when the verified transaction carries
  it, and the percentage otherwise, with the basis recorded. With neither, the webhook
  answers 503 so that Paystack retries.
- **Allocation reads dues outside the transaction, under a row lock** on the member's
  dedicated accounts. Earlier allocations have committed before the lock is granted.
- **A phone is required** before assignment, because Paystack needs one for the customer.
  New open question **PAY-20**: whether a BVN may be collected if Paystack demands
  identification. None is collected now.
- **The order setting has two alternatives** to `OLDEST_FIRST`: member dues first, or
  vehicle dues first. They are grouped by what a fee is charged against, never by fee code.

**Pending:** the screens have not been clicked through in a browser. Nothing has been tried
against Paystack's real test mode yet; the steps are in `OPERATIONS.md` under "Switching on
dedicated accounts".
