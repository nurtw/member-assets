# 58 — remove-imported-members

## Item
Remove the imported members that were not added through the System.

## Source
PRD revision 1.20; `QUESTIONS.md` MIG-08 (answered 16 November 2026: delete all, hard
delete). Departs on purpose from `CLAUDE.md` domain rule 5 (history is never hard-deleted).

## Goal
Every member with a `legacy_id` is gone, their vehicles keep everything but the driver link,
and every member with none is untouched. It is done once, by a script, never by a route.

## Approach
1. Add `apps/api/scripts/remove-imported-members/index.ts`, run as `pnpm --filter api
   remove:imported-members`, in the style of `migrate-legacy` (no decorators).
2. **Dry run by default.** Count the imported members, their vehicles, and what is attached
   to each: card, dedicated account, transfer, payment (subject `member`), application,
   SMS, media. Print counts only, never names.
3. **Refuse** if any imported member holds a card, a dedicated account or transfer, or a
   confirmed payment: that is money or a credential, and `Restrict` already forbids it.
   List the counts and stop. The owner decides those separately.
4. `--execute` first writes a **restore point** to `data/restore-points/` (gitignored: it
   holds real personal data): the rows of every table touched, and the media storage keys.
5. Then, in one transaction: set `vehicle.declared_by_member_id` to null; delete the media
   rows of their photographs and signatures; delete the members (contact, next of kin,
   guarantor, identity, SMS cascade); write one `audit_event` with the counts.
6. Never touch a member whose `legacy_id` is null. Assert it before committing.
7. Rehearse on the local database with synthetic members, then run the dry run on Neon and
   show the owner the counts. **Execute only on the owner's go-ahead.**

## Files likely touched
`apps/api/scripts/remove-imported-members/*`, `apps/api/package.json`,
`apps/api/test/remove-imported-members.e2e-spec.ts`, `docs/reference/OPERATIONS.md`,
`HANDOFF.md`.

## Out of scope
Archiving or a delete route. Removing the imported vehicles. Removing storage files by hand
(the export lists their keys). Item 61.

## Definition of done
- [x] The dry run changes nothing; a test proves it.
- [x] A test proves the refusal on a card, a dedicated account, or a payment.
- [x] A test proves a member added through the System survives, and a linked vehicle loses
      only the driver link.
- [x] The restore point is written first and holds no file under version control.
- [x] One audit event carries the counts and no name.
- [x] The Neon dry run is shown to the owner (16 November: 81 imported, 13 kept, not blocked); the delete ran only after their go-ahead (16 November, 81 deleted).
