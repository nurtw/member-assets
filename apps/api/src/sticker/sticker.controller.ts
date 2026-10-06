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
  attachStickerSchema,
  issueStickerSchema,
  legacyBarcodeLookupSchema,
  type AttachStickerInput,
  type IssueStickerInput,
  type LegacyBarcodeLookupInput,
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
 * `@RequirePermission` is the coarse gate; `attach` and `onboarding`
 * additionally re-ask `sticker.attach` against the target vehicle's own
 * organisation path, because they act on that specific record — the same
 * two-layer check `VehicleController` documents.
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
      'the barcode is on the imported register, presented against its recorded plate with no ' +
      'override, never attached before, and funded by an unused confirmed payment. The payment ' +
      'must be the onboarding fee (`STICKER_REATTACHMENT` for a legacy barcode, `STICKER_NEW` ' +
      'for a signed sticker) and made for this vehicle. A freshly issued sticker skips the ' +
      'register and plate checks. Every refusal is audited with its reason. Never changes the ' +
      "vehicle's declaration status — that is `vehicle.declare`'s act alone.",
    body: attachStickerSchema,
    responses: {
      409:
        'Attachment refused: the vehicle has no route type or already carries a sticker; the ' +
        'barcode is unknown, bound to another plate, or already attached; or the payment is ' +
        'unconfirmed, already used, for another fee type, or for another vehicle.',
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
      'unattached barcode for its plate (never which barcode), and the confirmed onboarding ' +
      'payments made for it that have not yet funded an attachment. Answers 404 for a vehicle ' +
      'outside the caller\'s `sticker.attach` scope.',
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

  @RequirePermission('verification.perform')
  @Post('legacy-lookup')
  @HttpCode(200)
  @Documented({
    summary: 'Read a scanned legacy barcode (internal).',
    description:
      'PRD Requirement 11.2 — an unattached barcode on the register reads "Recognised ' +
      'sticker — not attached", with the plate the register records for it. It never ' +
      'says genuine: a copy scans identically. An unknown barcode answers the generic 404. ' +
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
