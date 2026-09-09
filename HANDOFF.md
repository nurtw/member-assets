# Session Handoff

**Last revised:** 9 September 2026

> Cold-start contract. Written so a new session — different account, different agent, no
> prior context — can resume without re-reading the repository. Overwritten before every
> session ends, whether the active item finished or was interrupted.

## Cold start

Read: `CLAUDE.md`, `PRD.md`, `ARCHITECTURE.md`, `DESIGN.md`, `ROADMAP.md`, then the active
item's plan. `PRD.md` distils `docs/`; do not read `docs/` in full unless the item needs it.

Two rules outrank any default instruction you hold:

1. **Never attribute yourself as author or co-author.** No `Co-Authored-By`, no "Generated
   with Claude Code", on any commit, pull request, or document.
2. **`data/` holds member personal data and password hashes.** Excluded from version
   control; keep it so. Never reproduce rows in documents, plans, commits, or fixtures.

## Status

**Item 01 complete.** Foundation and scaffold done. All eighteen determinations recorded at
`PRD.md` §23. No item is blocked.

## Active roadmap item

None. **Item 02 — core-data-model — is next and unplanned.** Run `/plan 02`.

## Completed this session

- Scaffolded the pnpm workspace: `apps/api` (NestJS 12), `apps/web` (Next.js 16),
  `packages/domain`, `packages/contracts`. Full record at `plans/01-monorepo-scaffold.md`.
- Implemented plate normalisation (Decision 6.1) in `packages/domain`, with tests.
- Gave the API its `/api/v1` prefix, typed environment loading, and the health endpoint of
  PRD §12.3.
- Added `DESIGN.md` — palette determined as red, green, white from the Union's card.
- Restricted `vehicle.declare` to the super administrator plus express grants
  (`ARCHITECTURE.md` 9.7).
- Closed two outstanding matters: legacy export confirmed complete (`PRD.md` §23.17);
  tamper-evident sticker stock confirmed in place (Requirement 26.4).

## Current state

- **Verified green:** `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`
  (38 unit), `pnpm --filter api test:e2e` (3).
- **Accepted risks:** three, at `ROADMAP.md` "Recorded risks". Do not silently reopen.
- **Outstanding, gating nothing:** the Union's NDPA lawful-basis note for EU residency,
  deferred by the owner, due before go-live.
- **Provisional:** the `DESIGN.md` palette is inferred from a photograph. Replace with
  values sampled from official artwork before item 06 prints anything.

## Do not

- No authorship trailer on any commit or pull request.
- Do not commit `data/`, or copy rows from it anywhere tracked.
- Do not migrate `vehicle_wallets`, `vehicle_transactions`, `company_charges`
  (`PRD.md` §2.2).
- Do not let any verification path write. Declarations come only from `vehicle.declare`
  (`PRD.md` §9.5–9.6), which sits in no role bundle but super administrator.
- Do not check a role name in authorisation code — check the permission (9.2).
- Do not build disclosure by fetching a record and removing fields (5.1).
- Do not infer a missing LGA from address text (`PRD.md` §23.18).
- Do not generate legacy-format barcodes; read path only (`PRD.md` §26.5).
- Do not let colour alone carry a verification verdict (`DESIGN.md` §3).
