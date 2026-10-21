## Item
56 — officer-access-forms

## Source
The owner's direction of 20 October 2026: an officer's access should not force a part of
the Union or a reason, and several permissions should be given at once. PRD §16,
Requirement 17; ARCHITECTURE Decisions 9.4 and 9.6; item 28.

## Goal
On an officer's page, a role or permissions are given without typing a reason, "Applies
to" opens on the widest part of the Union the administrator may give (the State Council
for the super administrator), and several permissions are granted or revoked in one act.

## Approach
1. **Reason optional** for giving a role, granting, and revoking (`assignRoleSchema`,
   `scopedPermissionSchema`). A blank reason is stored as none, never as an empty
   string; the audit event records none. Migration: `user_permission_grant.reason` and
   `user_permission_revocation.reason` become nullable. Removing a role, withdrawing a
   grant, and lifting a revocation keep their reason (`ConfirmDialog`).
2. **Several permissions at once.** `scopedPermissionSchema` takes `permissions` (and
   still `permission`). `UsersService.grant` and `revoke` check every one (catalogue,
   escalation, not already in place) before writing any, then write them in one
   transaction, one audit event each. All or nothing.
3. **Applies to** shows the widest node the officer's tree holds (`widestScope`,
   `lib/organisation-tree.ts`) until another is chosen. Still shown, still changeable;
   the API still requires and checks it.
4. **The screen:** a checklist with a filter (shared with Compose a role), each entry
   marked where it is already granted or revoked there; Grant and Revoke send only what
   is not already in place, and say how many.

## Files likely touched
`packages/contracts/src/users.ts` (+ test), `apps/api/prisma/` (schema, migration),
`apps/api/src/users/`, `apps/api/test/users.e2e-spec.ts`,
`apps/web/src/app/(app)/settings/users/`, `apps/web/src/components/officers.tsx`,
`apps/web/src/lib/`, `ARCHITECTURE.md`, `CLAUDE.md`, `openapi.json`.

## Out of scope
Several roles at once. Giving access in the Add an officer dialog. Reasons on removals.

## Definition of done
- [x] A role, a grant, and a revocation succeed with no reason.
- [x] Several permissions are granted, and revoked, in one act; one refused refuses all.
- [x] Applies to opens on the State Council for the super administrator.
- [x] Every suite passes; clicked through as the super administrator, in both themes and
      on a phone (21 October).
- [x] Release: `db:deploy` on Neon (migration `20261020090000_optional_access_reasons`)
      before the push; live 21 October.
