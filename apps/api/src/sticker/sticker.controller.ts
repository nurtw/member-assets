import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  addStickerStockSchema,
  attachStickerSchema,
  issueStickerSchema,
  legacyBarcodeLookupSchema,
  stickerReadingSchema,
  withdrawStickerStockSchema,
  type AddStickerStockInput,
  type AttachStickerInput,
  type IssueStickerInput,
  type LegacyBarcodeLookupInput,
  type StickerReadingInput,
  type WithdrawStickerStockInput,
} from '@nurtw/contracts';

import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Documented } from '../docs/documented.decorator.js';
import { StickerService } from './sticker.service.js';

/**
 * Vehicle sticker issuance, attachment, and onboarding (PRD §10, §26, §9A —
 * items 08 and 17).
 *
 * `@RequirePermission` is the coarse gate; `attach`, `onboarding`, and
 * `reading` additionally re-ask `sticker.attach` against the target vehicle's
 * own organisation path, because they act on that specific record — the same
 * two-layer check `VehicleController` documents.
 *
 * The stock routes (item 27) are not organisation-scoped: a sticker in stock
 * is attached to nothing yet. `sticker.stock_intake` is in no role.
 */
@Controller('stickers')
export class StickerController {
  constructor(private readonly stickers: StickerService) {}

  @RequirePermission('sticker.issue')
  @Post()
  @Documented({
    summary: 'Issue a fresh, unattached sticker.',
    description:
      'PRD Requirement 10.3 — a sticker may exist unattached. Not organisation-scoped: nothing ' +
      'is attached yet, so there is no record to scope against (the same reasoning master data ' +
      'is exempt for). Attaching it to a vehicle is a separate act — see `POST /stickers/attach`.',
    body: issueStickerSchema,
  })
  async issue(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(issueStickerSchema)) body: IssueStickerInput,
  ) {
    return { sticker: await this.stickers.issue(this.userId(request), body) };
  }

  @RequirePermission('sticker.attach')
  @Post('attach')
  @Documented({
    summary: 'Attach a sticker to a vehicle (onboarding).',
    description:
      'PRD Requirement 9A.2/9A.4 — attaching a legacy barcode requires all four conditions: ' +
      'the barcode is held (on the imported register, or in stock); a register barcode is ' +
      'presented against its recorded plate, with no override; it has never been attached ' +
      'before; and it is funded by an unused confirmed payment. The payment must be the ' +
      'onboarding fee, made for this vehicle: `STICKER_REATTACHMENT` for a register barcode, ' +
      '`STICKER_NEW` for one from stock or a signed sticker. `legacyBarcode` may be what a ' +
      'camera read from the sticker; the barcode is taken from it. Every refusal is audited ' +
      "with its reason. Never changes the vehicle's declaration status — that is " +
      "`vehicle.declare`'s act alone.",
    body: attachStickerSchema,
    responses: {
      409:
        'Attachment refused: the vehicle has no route type or already carries a sticker; the ' +
        'barcode is not held, bound to another plate, already attached, or withdrawn; or the ' +
        'payment is unconfirmed, already used, for another fee type, or for another vehicle.',
    },
  })
  async attach(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(attachStickerSchema)) body: AttachStickerInput,
  ) {
    return { sticker: await this.stickers.attach(this.userId(request), body) };
  }

  @RequirePermission('sticker.attach')
  @Get('onboarding/:vehicleId')
  @Documented({
    summary: "A vehicle's onboarding state.",
    description:
      'Item 17 — whether the vehicle is onboarded, whether the legacy register holds an ' +
      'unattached barcode for its plate (never which barcode), whether stock holds a sticker ' +
      'that can be attached (never how many), and the confirmed onboarding payments made for ' +
      'it that have not yet funded an attachment. Answers 404 for a vehicle outside the ' +
      'caller\'s `sticker.attach` scope.',
  })
  async onboarding(
    @Req() request: AuthenticatedRequest,
    @Param('vehicleId', new ParseUUIDPipe()) vehicleId: string,
  ) {
    return {
      onboarding: await this.stickers.onboardingState(
        this.userId(request),
        vehicleId,
      ),
    };
  }

  @RequirePermission('sticker.attach')
  @Post('onboarding/:vehicleId/reading')
  @HttpCode(200)
  @Documented({
    summary: 'What a scanned sticker can be for a vehicle.',
    description:
      'PRD Requirement 9A.7 — asked before attaching, so that a refusal is rarely met blind. ' +
      'Send `code`: what a camera read from the sticker, or its number. The answer is one of ' +
      '`CAN_ATTACH` (with the fee it must be paid with), `NOT_HELD`, `FOR_ANOTHER_VEHICLE` ' +
      '(that vehicle is not named), `ALREADY_ATTACHED`, or `NOT_AVAILABLE`. Read-only apart ' +
      'from its audit event. Answers 404 for a vehicle outside the caller\'s `sticker.attach` ' +
      'scope.',
    body: stickerReadingSchema,
  })
  async reading(
    @Req() request: AuthenticatedRequest,
    @Param('vehicleId', new ParseUUIDPipe()) vehicleId: string,
    @Body(new ZodValidationPipe(stickerReadingSchema)) body: StickerReadingInput,
  ) {
    return {
      reading: await this.stickers.readForVehicle(
        this.userId(request),
        vehicleId,
        body.code,
        {
          ipAddress: request.ip,
          requestId: request.header('x-request-id'),
        },
      ),
    };
  }

  @RequirePermission('sticker.stock_intake')
  @Get('stock')
  @Documented({
    summary: 'The sticker stock.',
    description:
      'PRD Requirement 9A.8 — printed legacy stickers taken into stock by scanning: how many ' +
      'are in stock, attached, and withdrawn, and the latest entries, newest first. A sticker ' +
      'in stock is bound to no plate until it is attached.',
  })
  async stock(@Req() request: AuthenticatedRequest) {
    return this.stickers.listStock(this.userId(request));
  }

  @RequirePermission('sticker.stock_intake')
  @Post('stock')
  @HttpCode(200)
  @Documented({
    summary: 'Add a printed sticker to stock.',
    description:
      'PRD Requirement 9A.8 (VEH-29). Send `code`: what a camera read from the sticker, or ' +
      'its number. A legacy barcode proves nothing by itself, so the control is who may add ' +
      'one: `sticker.stock_intake` is in no role, and every addition is audited. A barcode ' +
      'already on the register or in stock is not added twice: the answer is `ALREADY_HELD`, ' +
      'not an error. Anything that is not a barcode answers 400 naming `code`.',
    body: addStickerStockSchema,
  })
  async addToStock(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(addStickerStockSchema)) body: AddStickerStockInput,
  ) {
    return this.stickers.addToStock(this.userId(request), body.code, {
      ipAddress: request.ip,
      requestId: request.header('x-request-id'),
    });
  }

  @RequirePermission('sticker.stock_intake')
  @Post('stock/:id/withdrawal')
  @HttpCode(200)
  @Documented({
    summary: 'Withdraw a sticker from stock.',
    description:
      'PRD Requirement 9A.8 — for a sticker lost, damaged, or added by mistake. A reason is ' +
      'required. Final: the sticker can never be attached, and its barcode cannot be added ' +
      'again. Nothing is deleted.',
    body: withdrawStickerStockSchema,
    responses: {
      409: 'The sticker is attached to a vehicle, or was already withdrawn.',
    },
  })
  async withdrawFromStock(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(withdrawStickerStockSchema))
    body: WithdrawStickerStockInput,
  ) {
    return {
      sticker: await this.stickers.withdrawFromStock(
        this.userId(request),
        id,
        body.reason,
        {
          ipAddress: request.ip,
          requestId: request.header('x-request-id'),
        },
      ),
    };
  }

  @RequirePermission('verification.perform')
  @Post('legacy-lookup')
  @HttpCode(200)
  @Documented({
    summary: 'Read a scanned legacy barcode (internal).',
    description:
      'PRD Requirement 11.2 — an unattached barcode on the register reads "Recognised ' +
      'sticker — not attached", with the plate the register records for it; one in stock ' +
      'reads "in stock, not attached", with no plate. It never says genuine: a copy scans ' +
      'identically. A barcode that is not held answers the generic 404. ' +
      'Read-only apart from its audit event. Sent as a body so the barcode stays out of URLs ' +
      'and access logs.',
    body: legacyBarcodeLookupSchema,
  })
  async legacyLookup(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(legacyBarcodeLookupSchema))
    body: LegacyBarcodeLookupInput,
  ) {
    return {
      reading: await this.stickers.lookupLegacyBarcode(
        this.userId(request),
        body.barcode,
        {
          ipAddress: request.ip,
          requestId: request.header('x-request-id'),
        },
      ),
    };
  }

  private userId(request: AuthenticatedRequest): string {
    const userId = request.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }
    return userId;
  }
}
