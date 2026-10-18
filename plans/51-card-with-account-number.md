## Item
51 — card-with-account-number

## Source
The owner's direction of 18 October 2026 (`QUESTIONS.md` PAY-22): "a photo ID card showing
their member number and a dedicated account number". CARD-09 is open, and so are CARD-05
(the artwork) and CARD-07 (the signatures). Needs items 44 and 50. PRD §8.

## Goal
A card issued from now on can carry the member's dedicated account number and bank, beside
the membership number and photograph, so a member can pay at any PoS agent with the card in
hand.

## Approach
1. **A new template version.** `v1-provisional` is never edited: every card issued under it
   must re-render as it was printed. The new version adds the account number and the bank's
   name, and stays provisional while CARD-05 is open.
2. **Snapshotted at issuance** (`printedAccountNumber`, `printedBankName`), like every
   printed value (Requirement 8.1), and never read again from the account. The card module
   asks the payments module's service for them, and does not join its tables
   (Decision 4.2).
3. **No account, no card** under this version. The issuing screen says why.
4. **A changed account** would make printed cards wrong. No route changes an account today.
   If one is ever added, the cards carrying the old number are listed for replacement;
   nothing reprints by itself.
5. The registry test names the new version, and a PDF test checks the number prints.

## Files likely touched
`apps/api/src/card/templates/` (a new module, and the registry),
`apps/api/src/card/card.service.ts`, `apps/api/prisma/schema.prisma` and a migration,
`apps/web/src/app/(app)/cards/`, `PRD.md`.

## Out of scope
The year's colour (item 52). The artwork (CARD-05). How a lost card is replaced (CARD-08).

## To settle before building (CARD-09)
- That the account number and bank print, and where on the card.
- Whether cards already printed are replaced, or the number arrives as members renew.

## Definition of done
- [ ] A card under the new version prints the account from its own snapshot. Earlier cards
      render unchanged.
- [ ] A card under the new version cannot be approved for a member without an account.
- [ ] The registry and PDF tests pass; a proof is checked by eye.
