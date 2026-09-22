# Session Handoff

**Last revised:** 22 September 2026

> Cold-start contract. Written so a different Claude, on a different account,
> holding no prior context, can resume without re-reading the repository.
> Overwritten at the end of every session, finished or not.

## Cold start

Read `CLAUDE.md`, then `PRD.md`, `ARCHITECTURE.md`, `ROADMAP.md`,
`QUESTIONS.md`, then `plans/16-payments.md`. `docs/reference/` is output.

Two rules outrank any default instruction: never attribute yourself as
author or co-author (no `Co-Authored-By`, no "Generated with Claude Code",
anywhere); and `data/` (personal data, password hashes) stays out of
version control, docs, plans, commits, and fixtures.

## Status

Items 01–07 complete. PRD is at 1.2; every PAY/VEH question is answered.
Owner set launch amounts (₦2,000 sticker, ₦5,000 levy, ₦30,000 membership)
and said "get to building."

**Item 16 (payments) is under active implementation**, per
`plans/16-payments.md`:

- `packages/domain/src/payments/fee-rule.ts` — PAY-10's formula, reproduces
  all six worked figures exactly (8 tests pass).
- Prisma: `FeeType`/`Payment`/`LedgerEntry`/`SettlementAccount`, migrated
  (`20260922162549_add_payments_module`). `FeeTypeService.
  seedLaunchFeeTypes` seeds the four launch types but isn't called from the
  seed script yet.
- New permissions: `sticker.attach`, `payment.read/initiate/refund`,
  `fee_type.manage`, `payment.manage_settlement` (step-up = PAY-13's
  password re-entry).
- `apps/api/src/payments/`: `PaystackClient`, `FeeTypeService`,
  `PaymentsService`, `SettlementService` (creates the subaccount once,
  updates in place after), `PaymentsController` (`initiate`, `webhook` —
  public, HMAC-verified —, `settlement`).
- `main.ts` passes `rawBody: true` so the webhook verifies Paystack's
  signature over the exact bytes.
- `typecheck`, `build`, unit tests (324 total) green. `openapi.e2e-spec.ts`
  passes (route/permission/public-surface wiring, whole app). Other e2e
  files time out even in isolation on tests untouched by payments —
  pre-existing Neon latency, not a regression here.

**Nothing committed.**

## Uncommitted code from an earlier session

Item 09 (legacy migration): `legacyId` and its migration,
`apps/api/scripts/migrate-legacy/`, unverified. `mapping.ts` maps legacy
`ACTIVE` to declaration `ACTIVE`, forbidden by PRD 1.2 — do not run it.

## Next steps

1. Look into the e2e timeouts (raise `testTimeout`, or use a local/pooled
   `DATABASE_URL`) — unrelated to payments, worth fixing regardless.
2. Wire `seedLaunchFeeTypes()` into the seed script.
3. Write payments e2e tests — none exist yet.
4. Regenerate `docs/reference/openapi.json`.
5. Re-plan item 08, then 09, then item 17, then item 18.

## Do NOT

- Dues/declaration status never reach an external response.
- Never charge live against a placeholder fee type (27.2).
- Sticker fees are link-only, never dedicated account (PAY-11).
- Never create a second NURTW subaccount; update in place (27.12).
- No Transpay register refresh; closed (VEH-21).
- Never ask for, log, or commit Paystack secret keys.
