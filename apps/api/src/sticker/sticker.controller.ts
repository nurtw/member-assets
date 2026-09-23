import { Body, Controller, Post, Req, UnauthorizedException } from '@nestjs/common';
import {
  attachStickerSchema,
  issueStickerSchema,
  type AttachStickerInput,
  type IssueStickerInput,
} from '@nurtw/contracts';

import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Documented } from '../docs/documented.decorator.js';
import { StickerService } from './sticker.service.js';

/**
 * Vehicle sticker issuance and attachment (PRD §10, §26, §9A — item 08).
 *
 * `@RequirePermission` is the coarse gate; `attach` additionally re-asks
 * `sticker.attach` against the target vehicle's own organisation path,
 * because it is a write against that specific record — the same two-layer
 * check `VehicleController` documents.
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
    const userId = request.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }
    return { sticker: await this.stickers.issue(userId, body) };
  }

  @RequirePermission('sticker.attach')
  @Post('attach')
  @Documented({
    summary: 'Attach a sticker to a vehicle (onboarding).',
    description:
      'PRD Requirement 9A.2/9A.4 — attaching a legacy barcode requires all four conditions: ' +
      'the barcode is on the imported register, presented against its recorded plate with no ' +
      'override, never attached before, and funded by an unused confirmed payment. A freshly ' +
      'issued sticker skips the register and plate checks. Never changes the vehicle\'s ' +
      'declaration status — that is `vehicle.declare`\'s act alone.',
    body: attachStickerSchema,
    responses: {
      409: 'Attachment refused: already attached, unknown barcode, plate mismatch, or the ' +
        'payment reference has already funded another attachment.',
    },
  })
  async attach(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(attachStickerSchema)) body: AttachStickerInput,
  ) {
    const userId = request.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }
    return { sticker: await this.stickers.attach(userId, body) };
  }
}
