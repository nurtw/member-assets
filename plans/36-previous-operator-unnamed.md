## Item
36 — previous-operator-unnamed

## Source
The owner's direction of 5 October 2026 (`QUESTIONS.md` GOV-21): the previous operator's
name is to appear nowhere in the codebase, and no screen is to say that a sticker's code
came from it. PRD §23.19 and Requirement 11.2 (revision 1.12).

## Goal
The name is in no tracked file, and cannot return unnoticed. Officers see "sticker" and
nothing about which scheme a sticker belongs to.

## Approach
1. Replace the name in every tracked file: "legacy barcode", "legacy sticker", "the legacy
   register", and "the previous operator".
2. Reword what an officer reads so it says only "sticker".
3. Rename `plans/27` and the one constant that carried the name.
4. Relabel imported stickers `legacy-barcode`: in the import, and by a migration for rows
   already there.
5. A test that reads every file git tracks and fails on the name, without containing it.
6. Record the rule in `CLAUDE.md` and `QUESTIONS.md`.

## Files likely touched
48 files held the name: the root documents, `docs/reference/`, `plans/`, the sticker and
verification code and tests in `apps/api`, `packages/domain`, and `packages/contracts`,
and four screens in `apps/web`.

## Out of scope
Rewriting git history, which keeps the name in commits before this one. Rewriting audit
events already written: the audit trail is never changed.

## Definition of done
- [x] No tracked file, and no file name, holds the name.
- [x] `apps/api/src/common/repository-wording.spec.ts` fails if it returns.
- [x] Officer-facing wording says only "sticker".
- [x] Domain, contracts, and the sticker and verification suites pass.

## Decided while building
- **The audit trail keeps its old wording.** 2,408 `sticker.legacy_import` events carry the
  name in their reason. They are not rewritten. Only future runs of the import use the new
  wording.
- **The label migration writes the old value in two parts**, so the migration file itself
  does not hold the name.
- **A legacy sticker's QR code holds an address on the previous operator's own site.**
  `QUESTIONS.md` VEH-13 now describes that address without giving it. The System reads the
  barcode from the end of whatever address it is given, and never looks at whose it is.
