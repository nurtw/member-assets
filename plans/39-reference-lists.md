## Item
39 — reference-lists

## Source
The owner's choice of 6 October 2026 ("the missing admin screens"). PRD §23.4, §23.21
(route types). `QUESTIONS.md` ORG-06: the approved designations are not yet supplied.
Item 04 built the routes; the screens only ever read them.

## Goal
The Union keeps its own lists: vehicle categories, route types, designations, and local
government areas. An entry is added, relabelled, or switched off from a screen.

## Approach
1. **Reference lists** (`/settings/lists`), with one tab per list, kept in the address
   (`useTabParam`).
2. **Each tab** is a table read with `includeInactive=true`: code, label, order, and
   whether it is active. A local government area shows its name and state instead.
3. **Add**, for a holder of `master_data.manage`: code, label, and order. The dialog says
   the code cannot be changed afterwards, because it cannot.
4. **Edit** the label and the order. The code is shown and never editable.
5. **Deactivate or reactivate** through `ConfirmDialog`. The route takes no reason, so
   none is asked. The dialog says what follows: records that already carry the entry keep
   it, and it is no longer offered for new ones.
6. **Route types** say where their levy is priced, with a link to Fees. A new route type
   pays the levy's default until it is given a price there.
7. Navigation, landing order, and an icon. No API change.
8. **Click-through** with synthetic entries, removed from the local database afterwards.

## Files likely touched
`apps/web/src/app/(app)/settings/lists/`, a new
`apps/web/src/components/reference-list.tsx`, `apps/web/src/lib/navigation.ts`,
`apps/web/src/components/shell/nav-icon.tsx`, `docs/reference/OPERATIONS.md`, `CLAUDE.md`.

## Out of scope
- **The designations themselves.** ORG-06 is the Union's to supply. The demo designations
  stay marked `DEMO_`; the screen is how the Union replaces them.
- Changing or deleting a code.
- A reason on these changes, which would be a change to the API.
- Fee amounts, which stay on the Fees screen.

## Definition of done
- [ ] Each of the four lists can be read, added to, relabelled, and switched off and on.
- [ ] No screen offers to change a code.
- [ ] A deactivated entry stops being offered on the registration and vehicle forms, and
      stays on the records that carry it.
- [ ] An officer without `master_data.manage` sees the lists and no acts.
- [ ] Lint, typecheck, build, and the web tests pass; clicked through in both themes.
