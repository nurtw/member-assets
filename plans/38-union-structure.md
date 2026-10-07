## Item
38 — union-structure

## Source
The owner's choice of 6 October 2026 ("the missing admin screens"). PRD §6, §23.1, §23.3.
`QUESTIONS.md` ORG-05: the zones are answered, the branches are not. Item 04 built every
route; no screen calls the ones that change anything.

## Goal
The Union enters and maintains its own zones, branches, and units from a screen. When the
branch list arrives, somebody types it in. No deploy, and no seed.

## Approach
1. **Union structure** (`/settings/structure`): the tree from `GET /organisations`, as an
   indented list that opens and closes. Each row: name, level, whether it is active, and
   how many sit beneath it. The API already limits it to what the officer may read.
   `/organisations` is taken by outside organisations, hence the address.
2. **A filter by name**, in the browser. Nothing is searched on the server.
3. **The acts**, for a holder of `organisation.manage`, each in a dialog:
   - **Add beneath** a node. The level is fixed by the parent (a zone under the council, a
     branch under a zone, a unit under a branch), so it is shown, not chosen.
   - **Rename.**
   - **Move**, with a reason: the new parent is picked from nodes of the right level.
   - **Deactivate or activate**, with a reason, through `ConfirmDialog`.
4. **The web explains a refusal**, because the API's 409 is generic: a node with active
   children or members cannot be deactivated; a node under an inactive parent cannot be
   activated.
5. Navigation, landing order, and an icon. No API change is expected; if one is needed it
   gets its own end-to-end tests.
6. **Click-through** with synthetic nodes under a synthetic zone. A node is never deleted
   through the API, so the script removes them from the local database afterwards.

## Files likely touched
`apps/web/src/app/(app)/settings/structure/`, a new
`apps/web/src/components/organisation-tree.tsx`, `apps/web/src/lib/navigation.ts`,
`apps/web/src/components/shell/nav-icon.tsx`, `docs/reference/OPERATIONS.md`, `CLAUDE.md`.

## Out of scope
- **The branch list itself.** ORG-05 is the Union's to supply. Nothing is invented, and
  the demo branches stay marked as demo content.
- Importing a list from a file.
- A second council, and any change to the placement rule.
- Members or vehicles counted per node.

## Definition of done
- [ ] The tree shows what the officer may read, and nothing else.
- [ ] A node can be added, renamed, moved, deactivated, and activated from the screen, and
      each change is in the audit trail.
- [ ] Each refusal is explained in words.
- [ ] An officer without `organisation.manage` sees the tree and no acts.
- [ ] Lint, typecheck, build, and the web tests pass; clicked through in both themes, on a
      desktop and a phone.
