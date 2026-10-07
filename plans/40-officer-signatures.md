## Item
40 — officer-signatures

## Source
The owner's choice of 6 October 2026 ("the missing admin screens"). PRD §8, §23.7.
`QUESTIONS.md` CARD-07: the titles are known (State Chairman, Secretary); the names and
the signature images are not. Found while planning, on 7 October 2026:

- **A card administrator cannot upload a signature image.** Registering one needs
  `card_template.manage`, but the upload route needs `member.create`, which that role does
  not hold.
- **Anyone who registers members can upload an image marked as an officer's signature.**
  They cannot register it, but the upload should not be theirs to make.
- The list returns no image, so nobody can see which signature is in force.

## Goal
When the signatures arrive, an officer with `card_template.manage` registers each one from
a screen, sees what will print, and can withdraw it. Until then the screen says each
position is vacant and that cards issue with a blank line.

## Approach
1. **Upload**, new: `POST /officer-signatures/image` under `card_template.manage`. It goes
   through `MediaService`, so the bytes are sniffed as now. `POST /media` then refuses the
   officer-signature kind.
2. **Viewing**, new: a route that gives a holder of `card_template.manage` a five-minute
   signed link to one registered image.
3. **Officer signatures** (`/settings/signatures`): the two positions, each showing the
   name, the title, and since when, or "Vacant".
4. **Register or replace**, in a dialog: name, title, image, and a preview. It says the
   signature prints on every card issued from then on, and that cards already issued keep
   theirs.
5. **Withdraw** through `ConfirmDialog`, with a reason.
6. **History**: earlier signatures, read with `includeSuperseded=true`.
7. **Tests** for who may upload and who may view. The API reference is regenerated.
8. **Click-through** with a scribble drawn by the script. It is removed afterwards and
   never committed.

## Files likely touched
`apps/api/src/card/`, `apps/api/src/media/`, `packages/contracts/src/card.ts`,
`apps/web/src/app/(app)/settings/signatures/`, `apps/web/src/lib/navigation.ts`,
`docs/reference/openapi.json`, `docs/reference/OPERATIONS.md`, `CLAUDE.md`.

## Out of scope
- **Any signature, name, or sample image.** CARD-07 is the Union's to supply. A made-up
  signature would misrepresent a real person.
- The card artwork (CARD-05), and a new card template.
- Signing the vehicle letter, which stays blank until CARD-07.
- Reissuing cards that were issued with blank lines.

## Definition of done
- [ ] A card administrator can upload, register, view, and withdraw a signature. An
      officer who only registers members can do none of these.
- [ ] A vacant position says so, and says what a card will carry.
- [ ] No signature image is in the repository, a log, or an audit event.
- [ ] Lint, typecheck, build, and the tests pass; clicked through in both themes.
