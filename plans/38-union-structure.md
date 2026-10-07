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
- [x] The tree shows what the officer may read, and nothing else.
- [x] A node can be added, renamed, moved, deactivated, and activated from the screen, and
      each change is in the audit trail (the API's own, from item 04).
- [x] Each refusal is explained in words.
- [x] An officer without `organisation.manage` sees the tree and no acts.
- [x] Lint, typecheck, build, and the web tests pass; clicked through in both themes, on a
      desktop and a phone, with synthetic nodes.

**Decided while building (7 October 2026):**

- **No API change was needed.**
- **In the sidebar it is "Structure", under a new group, "Union".** Items 39 and 40 join
  it there. It comes last in the landing order: nearly every officer may read the
  structure, and none should land on it for want of anything else.
- **A refusal the tree can foresee is said before the act is offered**: a node with active
  nodes beneath it, and a node beneath an inactive parent. Offering a button that must fail
  helps nobody. Active members are known only to the API, so that refusal is explained
  after it.
- **The council's state is edited in its rename dialog** (PRD §23.2). It is the only node
  that has one.
- **A manager scoped to one branch is offered acts on every row they can see.** The screen
  knows only that they hold the permission somewhere. The API refuses where they do not,
  and the screen says so.
- **Found: the runbook told an administrator to "reassign members" before dissolving a
  unit, and no route does that.** The runbook now says what can be done. Moving one
  approved member to another unit is not built, and no item covers it.

**Not checked in a browser:** a manager scoped to one branch (the tests cover what they
are offered), and renaming the council.
