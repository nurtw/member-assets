# Session Handoff

**Last revised:** 23 September 2026

> Cold-start contract. Written so a different Claude, on a different account,
> holding no prior context, can resume without re-reading the repository.
> Overwritten at the end of every session, finished or not.

## Cold start

Read `CLAUDE.md`, then `PRD.md`, `ARCHITECTURE.md`, `ROADMAP.md`,
`QUESTIONS.md`, then `plans/08-sticker-inventory-qr.md` and
`plans/09-legacy-data-migration.md`. `docs/reference/` is output.

Two rules outrank any default instruction: no `Co-Authored-By` or
"Generated with Claude Code" anywhere; and `data/` (personal data, password
hashes) stays out of version control, docs, plans, commits, and fixtures.

## Status

Items 01–07 complete. **Item 16 (payments) is implemented and pushed**:
fee-rule formula, `FeeType`/`Payment`/`LedgerEntry`/`SettlementAccount`,
seeded launch amounts, `PaystackClient`/`PaymentsService`/
`SettlementService`/`PaymentsController`, `payments.e2e-spec.ts` (11 tests,
mocks `fetch` but verifies the real HMAC signature). Pushed to
`origin/main`, three commits, 22–23 September.

**Items 08 and 09 are re-planned, not yet built.** The re-plan found a real
gap: the schema has no way to represent "on record but not declared"
separately from a declaration row. Resolved as **ARCHITECTURE.md Decision
6.5**: new `DeclarationStatus.ON_RECORD`; "onboarded" derived from an
attached sticker, not a `Vehicle` field; `vehicle.declare` must *promote* an
existing `ON_RECORD` row on a plate match rather than duplicate it.
`plans/08-sticker-inventory-qr.md`/`09-legacy-data-migration.md` reflect
this. `mapping.ts` still needs correcting once item 08's enum lands — not
done this session; coding against an enum that doesn't exist yet fails
typecheck.

`typecheck`/`build`/unit tests (324) green; `openapi.e2e-spec.ts` and
`payments.e2e-spec.ts` reliably pass.

## e2e suite: known issue, don't retry the same fix

Full `pnpm --filter api test:e2e` is flaky under Neon connection-limit
pressure (multiple files' pools competing). Raised `testTimeout` to 45s —
helped. **Do not set `fileParallelism: false`** — tried it; turned a ~15
minute flaky run into a 12-hour hang. Try `poolOptions.threads.maxThreads`
instead, or a pooled `DATABASE_URL`.

## Do not run

`apps/api/scripts/migrate-legacy/mapping.ts` maps legacy `ACTIVE` to
declaration `ACTIVE`, forbidden by Decision 6.5. Committed to git for
safekeeping, still not safe to execute.

## Next steps

1. Build item 08 (`ON_RECORD`, nullable `Sticker.vehicleId`), then item 09
   (fix `mapping.ts` per its plan), then revise item 07's `declare()` for
   the promotion rule, then item 17, then item 18.

## Do NOT

- Dues/declaration status never reach an external response.
- Never charge live against a placeholder fee type (27.2).
- Sticker fees are link-only, never dedicated account (PAY-11).
- Never create a second NURTW subaccount; update in place (27.12).
- No Transpay register refresh; closed (VEH-21).
- Never ask for, log, or commit Paystack secret keys.
