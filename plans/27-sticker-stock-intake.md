## Item
27 — sticker-stock-and-scan

## Source
`QUESTIONS.md` VEH-29 (stock by scanning) and VEH-31 (pay, then scan), both the owner's
direction of 5 October 2026. PRD Requirements 9A.4, 9A.7, and 9A.8 (revision 1.12). The
owner deferred VEH-29 on 3 October 2026 and took it up two days later.

## Goal
An officer who holds the permission scans printed stickers into stock. Any officer who can
attach a sticker assigns one in the order the owner gave: take the fee, or find one
already paid; scan the sticker with the camera; confirm.

## Approach
1. **Rules** in `packages/domain`: where a sticker came from (register, stock, signed),
   the fee each needs, what a camera's reading reduces to, and what a vehicle can be given.
2. **Stock** in the API: `GET` and `POST /stickers/stock`, and
   `POST /stickers/stock/:id/withdrawal`, under `sticker.stock_intake`, which is in no role.
3. **A reading before attaching:** `POST /stickers/onboarding/:vehicleId/reading`, so an
   officer is told why a sticker cannot go on a vehicle before they try.
4. **A payment check:** `POST /payments/check`, so the screen does not wait on the webhook.
5. **A camera scanner** in the web app, with the number typed as the fallback.
6. **The assignment panel** rebuilt as three steps, a **Sticker stock** screen, and the
   camera on the Verify screen.

## Files likely touched
`packages/domain/src/sticker/`, `packages/contracts/src/{sticker,payments,permissions,verification}.ts`,
`apps/api/prisma/` (two migrations), `apps/api/src/sticker/`, `apps/api/src/payments/`,
`apps/api/src/verification/verification-records.service.ts`,
`apps/web/src/components/{qr-scanner,onboarding-section,sticker-prompt}.tsx`,
`apps/web/src/app/(app)/stickers/stock/`, the Verify page, and the navigation.

## Out of scope
A second officer confirming stock (VEH-32, open). Printing signed stickers, which stay
paused (VEH-20). Replacing a sticker already on a vehicle. A public sticker page (GOV-08).

## Definition of done
- [x] A holder of `sticker.stock_intake` adds a sticker by scanning it; nobody else can.
- [x] A sticker from stock attaches to any vehicle once, on a confirmed new-sticker payment.
- [x] A register sticker still attaches only to its own plate, on the reattachment fee.
- [x] The camera opens only after the payment is confirmed.
- [x] A withdrawn sticker can never be attached, and nothing is deleted.
- [x] Lint, typecheck, and the end-to-end suites pass; clicked through with a simulated
      camera.

## Decided while building
- **The sticker fee already went wholly to the contractor.** Both sticker fees are
  `CONTRACTOR_ONLY`, so no NURTW settlement account is needed to take one. Nothing changed.
- **A stock sticker is paid for as a new sticker.** The reattachment fee stays for the
  sticker a vehicle already carries. Where both are possible the officer chooses.
- **A legacy sticker's QR code holds a web address, not a number.** `stickerCodeFromScan`
  takes the barcode from its end, on every channel. Before this, an address sent to a
  verification was read as a signed code and recorded as a forgery.
- **A check only ever confirms.** `POST /payments/check` never closes a payment the payer
  has not finished; only the webhook does.
- **The reading does not name another vehicle.** A sticker recorded for a different plate
  is said to be so, without the plate.
- **The camera uses the browser's own QR reader where there is one**, and `jsqr` where
  there is not. The picture never leaves the device.
- **No search by number on the server.** A barcode in an address would reach the access
  log. The stock screen filters the latest 200 in the browser; scanning an older sticker
  says where it stands.
- **Not tried against Paystack, and not with a real camera.** The click-through used a
  stand-in for Paystack and a video file as the camera. `apps/api/.env` is not ours to use.
