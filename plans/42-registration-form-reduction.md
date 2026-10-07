## Item
42 — registration-form-reduction

## Source
Mr Timothy's walk-through of 6 October 2026. `QUESTIONS.md` MEM-16 (next of kin), MEM-06
as added to (guarantor), MEM-17 (Area). PRD §7, which takes the Union's printed form as its
specification. **Waits for the owner's approval: it changes a rule, the schema, and the
PRD.**

## Goal
The registration form asks for what the Union now says it needs, and no more. Nothing
already recorded is lost.

## Approach
1. **Next of kin:** one **Full name** and a **Telephone number**, both required. An
   **Address**, optional. Town, local government area, state of origin, and occupation
   leave the form.
2. **Guarantor**, still optional as a whole: **Full name**, **Telephone number**, and
   **Address**. Relationship, occupation, town, and the collateral question leave the form.
   The owner confirmed this reading on 7 October 2026: only those three.
3. **Area** leaves the form. Town / City stays.
4. **Schema**, by one migration that adds and loosens, and removes nothing:
   - A full-name column on next of kin and on guarantor. Existing rows get theirs from the
     three name parts they already hold.
   - The columns the form no longer fills become nullable. Their old values stay.
5. **Contracts and API:** the two schemas change; the record routes return the full name.
   The application's page and the member's record show what is there, old or new.
6. **The printed registration form** (the PDF for wet signature) prints the reduced
   sections.
7. **PRD §7** is revised, and MEM-07, MEM-08, and MEM-10 are closed as no longer asked.
8. Tests, a click-through, and the migration on Neon once the owner agrees.

## Files likely touched
`packages/contracts/src/membership.ts`, `apps/api/prisma/schema.prisma` and one migration,
`apps/api/src/membership/`, `apps/web/src/app/(app)/applications/`,
`apps/web/src/app/(app)/members/[id]/page.tsx`, `PRD.md`, `QUESTIONS.md`, `CLAUDE.md`.

## Out of scope
- The member's own name, which stays in three parts: the card prints it.
- Deleting any column or any recorded detail.
- Whether a guarantor must be a member (MEM-06, still open).

## To settle before building
- Whether the Union's **paper** form is being reduced too. If it is not, the System's
  printed form and the paper one will differ.

## Definition of done
- [x] The form asks for the fields above and saves them. An application with no guarantor
      still saves.
- [x] An application recorded before the change opens and prints with everything it had.
- [x] No column and no row is removed by the migration.
- [x] The PRD and the register say what the form now asks.
- [x] Lint, typecheck, build, and every test pass; clicked through.

**Decided while building (7 October 2026):**

- **The full name of an earlier next of kin or guarantor is put together by the migration**
  from the three name parts it held, first name first. Checked on a synthetic row before
  it was applied anywhere.
- **On a write, only the columns the form has are written.** An amendment of a draft made
  before the change keeps its occupation, town, relationship, and collateral. The three old
  name parts are cleared, because the full name just entered replaces them.
- **An area is written only when one is sent**, for the same reason.
- **The two people are returned as named fields**, where the application's detail used to
  return whole rows. The old name parts are not returned.
- **Details that are no longer asked for show, and print, only where there are any.**
- **A guarantor is started by filling any of its three fields**, and then needs all three.
- **The application's page now shows the town or city.** It did not before.

**Releasing it.** The migration must be on Neon **before** the new code serves traffic,
or the live API fails on the column it expects. Between the two, the code that is live
cannot save a new registration, because it does not fill the full name. So the migration
and the push go together, at a quiet moment.

**Not settled:** whether the Union's paper form is being reduced too. The System's printed
form follows the screen.

**Not checked in a browser:** amending a draft on the reduced form (the tests cover it).
