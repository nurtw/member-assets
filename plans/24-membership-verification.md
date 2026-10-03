## Item
24 — membership-verification

## Source
PRD §11, proposal §15 (Membership verification profile), acceptance criterion 12.
`ARCHITECTURE.md` Decisions 5.1, 5.3. Builds on item 10.

## Goal
An officer holding `verification.membership` checks the card a driver shows, by its card
number or its membership number, on the Verify screen. The result gives a verdict, every
reason behind a negative one, and the holder's name so the officer can compare it with the
card. The member's fee appears beside it. Every check is audited, and nothing else is
written.

## Approach
1. **Domain, pure** (`packages/domain/src/verification/membership.ts`):
   `decideMembershipVerification`. A membership number matches a member in good standing. A
   card number also needs the card to be `ACTIVE` and in date.
2. **Projection:** the catalogue gains `membership_status`, `card_status`, and `designation`
   (external-admissible, per §15) and `card_number` and `card_expiry_date` (internal-only).
3. **API:** `POST /verifications/membership` takes `{ number }`. Card and membership numbers
   share one format, so the number is tried as a card first. A mistyped number fails its
   check character in the schema, before any lookup.
4. **Web:** a Membership card tab on the Verify screen, shown to holders of the permission.
5. **Tests:** domain units, and e2e in the verification suite.

## Out of scope
The external membership endpoint (item 12, which reuses this rule). The holder's photograph
on the result. Scanning a card.

## Definition of done
- [x] A card number or a membership number gives MATCH or every reason: no record, member
      not active, card not active, card expired.
- [x] A number failing its check character answers 400 without a lookup.
- [x] The name shows to any holder of the permission; the fee only within `member.read`.
- [x] No response holds a restricted value. A check writes only its audit event.
- [x] Domain and e2e tests pass (verification suite 30/30). `openapi.json` is regenerated.

**Decided while building (3 October 2026):**

- **The name is shown to every officer who may run the check**, whatever their scope. It is
  part of what is being verified: comparing it with the card is how a genuine number copied
  onto someone else's card is caught.
- **A membership number does not need a valid card.** It answers whether the person is a
  member in good standing. The member's current card is shown beside it.
- **A card past its expiry date fails even if still marked `ACTIVE`**, because nothing flips
  a card to `EXPIRED` by itself yet.
- **`membership_status` is a field of its own**, apart from `member_status`. The first is a
  membership check's answer, which an outside profile may be given. The second describes the
  member a verified vehicle belongs to, which no outside profile may.

**Pending:** not opened in a browser. The holder's photograph would strengthen the check and
is not shown.
