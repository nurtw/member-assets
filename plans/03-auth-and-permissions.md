# 03 — auth-and-permissions

## Item

Internal authentication and the permission model.

## Source

PRD §16 (eleven roles), §17.1 (MFA for privileged roles). Structure fixed by
`ARCHITECTURE.md` Decisions 9.1–9.9.

## Goal

Authenticated internal users, a seeded permission catalogue and role set, per-user grants
and revocations resolved correctly against an organisational scope, and a guard that
refuses anything not explicitly permitted.

## Approach

1. **Resolution logic into `packages/domain` first.** Effective permissions are
   `(union of role grants) + explicit grants − explicit revocations`, evaluated within an
   organisational scope. This is the highest-correctness-risk code in the item and must not
   depend on Nest or Prisma to be tested. Exhaustive tests before any wiring.
2. **Revocation always wins** (Decision 9.3). Where a permission is both granted and revoked
   for the same user and scope, it is withheld. Assert this explicitly — it is the rule most
   likely to be "simplified" later by someone who reads the union first.
3. **Scope is a subtree test** (Decision 9.4) against the materialised path from item 02.
   Holding a permission at a branch means holding it for that branch and everything beneath,
   and for nothing above.
4. **Sessions, not JWTs.** Decision 9.1 says *session* for internal users. Opaque tokens
   stored hashed in Postgres, delivered as `httpOnly` cookies. Revocation is a row delete
   and is immediate — which a signed JWT cannot offer without a denylist that reintroduces
   the same lookup.
5. Seed the catalogue: permissions, the eleven system roles, and their bundles.
   `vehicle.declare` goes into the super-administrator bundle **only** (Decision 9.7).
6. `PermissionGuard` + `@RequirePermission()` decorator. Deny by default: a route without a
   declared permission is refused, not permitted.
7. MFA scaffolded as TOTP, required for privileged roles. Step-up built, left disabled
   (Decision 9.7.3).
8. An endpoint answering "who currently holds this permission, and in what scope"
   (Decision 9.7.1).

## Files likely touched

`packages/domain/src/permissions/**`, `apps/api/src/auth/**`,
`apps/api/src/common/guards/**`, `apps/api/prisma/seed.ts`,
`packages/contracts/src/permissions.ts`, `apps/api/prisma/schema.prisma` (session table).

## Out of scope

Any user-facing login screen — item 04 onwards. External client authentication — item 11,
and deliberately a separate mechanism sharing no storage (Decision 9.8). Password reset
flows and email delivery.

## Definition of done

- [x] Effective-permission resolution is exhaustively tested, revocation-wins included.
- [x] Scope containment tested: held at branch, denied above, allowed below.
- [x] Seed is idempotent and creates the eleven roles plus the catalogue.
- [x] `vehicle.declare` appears in no seeded bundle but super administrator, asserted by a test.
- [x] A route with no declared permission is denied, not allowed.
- [x] Session revocation takes effect on the next request, asserted against the database.
- [x] Password hashes never appear in a response or a log.
- [x] `pnpm build`, `typecheck`, `lint`, `test` all pass.

## Notes

Deny-by-default is the whole point. If the guard's failure mode is "allow", every future
route added without thought becomes a hole, and nobody will notice until an audit.
