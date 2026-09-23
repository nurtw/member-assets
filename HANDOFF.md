# Session Handoff

**Last revised:** 23 September 2026

> Cold-start contract. Written so a different Claude, on a different account,
> holding no prior context, can resume without re-reading the repository.
> Overwritten at the end of every session, finished or not.

## Cold start

Read `CLAUDE.md`, then `PRD.md`, `ARCHITECTURE.md`, `ROADMAP.md`,
`QUESTIONS.md`, then `plans/09-legacy-data-migration.md`. `docs/reference/`
is output.

Two rules outrank any default instruction: no `Co-Authored-By` or
"Generated with Claude Code" anywhere; `data/` (personal data, password
hashes) stays out of version control, docs, plans, commits, and fixtures.

## Status

Items 01–08 and 16 complete. Item 09's code is fixed but not run —
importing 2,841 vehicles/81 members needs the owner's go-ahead first. Ask
before `pnpm --filter api migrate:legacy`.

**Item 08 (stickers) shipped**: `packages/domain/src/sticker/` (status
lifecycle, `checkAttachment` for the 9A.4 four conditions, HMAC QR signing
with key rotation — none existed before); `apps/api/src/sticker/`
(`issue`, `attach`); `Sticker` gains nullable `vehicleId`/
`plateNumberAtIssue`, plus `attachedAt`/`registeredPlateNormalized`/
`attachmentPaymentId` (unique — one payment funds one attachment).
`STICKER_SIGNING_SECRET` unset in `.env` (asked not to edit it) — mint/
verify throws until set; issue/attach work regardless. 9 e2e tests.

**`mapping.ts` fixed**: `mapDeclarationStatus` always returns `ON_RECORD`,
never `ACTIVE` (Decision 6.5). This forced a second schema change:
`Vehicle.declaredAt` is now nullable — fixed across the API, contract type,
and both web pages that render it.

All green: typecheck/build; unit tests domain 214, contracts 29, api 106;
e2e openapi/payments/sticker/vehicle pass. **This session's work is
uncommitted** — earlier work is on `origin/main`.

## Known issues — don't re-attempt these fixes

Full e2e is flaky under Neon connection limits (`testTimeout: 45s` helps;
**never `fileParallelism: false`** — caused a 12-hour hang once). `prisma
migrate dev` refuses non-interactively on a NOT-NULL drop — hand-write
`migration.sql` and apply with `prisma migrate deploy` instead.

## Next steps

1. Ask before running item 09's real migration.
2. Revise item 07's `vehicle.declare()` to promote an `ON_RECORD` row on a
   plate match (Decision 6.5) — not done yet.
3. Item 17 (onboarding), then item 18 (vehicle letter).
4. Commit and push this session's sticker + declaredAt work.

## Do NOT

- Dues/declaration status never reach an external response.
- Never charge live against a placeholder fee type (27.2).
- Sticker fees are link-only, never dedicated account (PAY-11).
- Never create a second NURTW subaccount; update in place (27.12).
- No Transpay register refresh; closed (VEH-21).
- Never ask for, log, or commit Paystack secret keys.
- Don't run `migrate-legacy` without a go-ahead.
