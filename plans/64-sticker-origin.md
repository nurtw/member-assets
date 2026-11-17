# 64 — sticker-origin

## Item
The dashboard counts stickers from the imported register apart from those added through the System.

## Source
PRD revision 1.20, §9A; `QUESTIONS.md` VEH-41 (answered 16 November 2026), amending GOV-21 for the dashboard alone.

## Goal
An officer who may read stickers sees, on Home, how many stickers are from the imported register and how many were added through the System (taken into stock), and how many of each are attached to a vehicle. A sticker's own page still says only "sticker". The previous operator is never named.

## Approach
1. Domain: `stickerOriginGroup(origin)` maps `REGISTER` to `IMPORTED` and `STOCK`/`SIGNED` to `ADDED`; tests.
2. `GET /reports/sticker-origins` (`sticker.read`), new `ReportService`: for `REGISTER` (a registered plate), `STOCK` (`stockAddedAt`), and `SIGNED` (no legacy barcode), the count attached to a vehicle inside the caller's `sticker.read` scope. The count held and not yet attached has no organisation, so it goes only to a caller whose scope is a whole council; anyone else gets `null`.
3. Home: a "Stickers" block, shown only to a holder of `sticker.read`.
4. PRD §9A, `CLAUDE.md` (GOV-21 amended for the dashboard), `openapi.json`.

## Files likely touched
`packages/domain/src/sticker/`, `packages/contracts/src/report.ts` (new), `apps/api/src/report/` (new module), `apps/web` Home, docs.

## Out of scope
A sticker list, a sticker's page, naming a scheme anywhere else.

## Definition of done
- [x] The counts split imported from added, attached from held, inside the caller's scope.
- [x] Held-not-attached counts reach only a whole-council scope.
- [x] No response or screen names the previous operator or a scheme code.
- [x] Typecheck, lint, e2e pass.
