## Item
28 — officer-accounts-and-mfa

## Source
PRD §16, §17.1, §18; `ARCHITECTURE.md` Decisions 9.2–9.7. `QUESTIONS.md` GOV-16 to GOV-19.
Found missing on 4 October 2026: item 03 delivered the tables and the permission check, and
no route or screen that writes to them. Owner decisions of 4 October 2026: build now; a
temporary password at first sign-in; multi-factor sign-in for privileged permissions;
custom roles included.

## Goal
An administrator creates an officer, gives them a role within a zone, branch, or unit, and
grants or revokes a single permission. The officer signs in with a temporary password,
chooses their own, and, for privileged work, proves a second factor.

## Approach
1. **Domain:** which permissions need a second factor; which may never sit in a role; the
   password rule; the no-escalation rule.
2. **Schema:** must-change-password, the session's second-factor mark, recovery codes, and
   who assigned a role.
3. **Accounts:** create, amend, deactivate, reset password, reset second factor. A temporary
   password is shown once and must be changed.
4. **Access:** assign and remove roles by scope; grant, withdraw, and revoke permissions.
   Nobody gives what they do not hold there, and nobody changes their own access.
5. **Custom roles:** compose and amend; system roles stay immutable.
6. **Second factor:** authenticator-app codes and recovery codes; enrolment; the guard
   refuses a privileged permission to a session without one, once enforcement is on.
7. **Screens:** users, roles, own password and security, and the sign-in steps.
8. **Tests and docs**, correcting what item 03's summary claimed.

## Files likely touched
`packages/domain/src/permissions/`, `packages/contracts/src/`, `apps/api/prisma/`,
`apps/api/src/auth/`, `apps/api/src/users/`, `apps/api/test/users.e2e-spec.ts`,
`apps/web/src/app/`, `docs/reference/`.

## Out of scope
Emailed invitations and password-reset links (no mail service, GOV-08). Hardware keys.
Single sign-on.

## Definition of done
- [x] An officer can be created, signs in with the temporary password, and must change it.
- [x] A role or permission is given only within the giver's own scope and holdings.
- [x] Nobody changes their own roles, grants, or status.
- [x] A system role cannot be changed; `vehicle.declare` cannot be put in any role.
- [x] Every change is audited with a reason.
- [x] With enforcement on, a privileged permission needs a second-factor session.
- [x] No response, log, or audit event holds a password, secret, or recovery code.
- [x] Tests pass; `openapi.json` is regenerated.

**Decided while building (4 October 2026):**

- **The second factor is asked of the permission, not the role**, so a composed role
  holding a privileged permission is covered without being named.
- **Enforcement ships off** (`auth.mfa_enforced`), so no existing administrator is locked
  out before enrolling. Turning it on needs a session that has itself proved a factor.
  Until it is on, Requirement 17.1 is not met (GOV-18).
- **A code is accepted once**, and ten failed sign-ins lock the account for fifteen
  minutes (Requirement 17.4). Without a limit, six digits can be guessed.
- **The authenticator secret is encrypted** under `MFA_ENCRYPTION_KEY`. Without the key,
  enrolment answers 503 and nothing is stored in the clear.
- **Moving to a new phone needs the old factor first**, so a stolen password cannot move
  the second factor.
- **A third kind of route**, open to any signed-in officer, for the officer's own account.
  An officer with no role, or on a temporary password, must be able to reach it.
- **Nobody changes their own access, status, password, or factor through the
  administration routes.** A second administrator does it.
- **Composing a role needs every permission in it**, since amending an assigned role
  changes its holders' access with no assignment step to check.
- **Roles are not deleted.** One with no assignment simply does nothing.

**Pending:** not opened in a browser. No QR code on the enrolment screen: the key is typed,
or opened by link on a phone. Emailed invitations wait for a mail service (GOV-08).
