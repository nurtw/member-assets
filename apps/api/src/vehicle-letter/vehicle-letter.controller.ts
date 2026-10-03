import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import {
  reissueVehicleLetterSchema,
  type ReissueVehicleLetterInput,
} from '@nurtw/contracts';
import type { Response } from 'express';

import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { resolveRequestId } from '../common/error-response.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Documented } from '../docs/documented.decorator.js';
import { VehicleLetterService } from './vehicle-letter.service.js';

/**
 * The vehicle letter (PRD Requirement 9A.6, item 18). Under `/vehicles` because
 * it is read from the vehicle's page; its own controller because it belongs to
 * this module, not to vehicle declaration.
 */
@Controller('vehicles')
export class VehicleLetterController {
  constructor(private readonly letters: VehicleLetterService) {}

  @RequirePermission('vehicle.read')
  @Get(':id/letter')
  @Documented({
    summary: "Download the vehicle's letter as a PDF.",
    description:
      'PRD Requirement 9A.6 — produced when the vehicle was onboarded and rendered from the ' +
      'snapshot taken then, through the template version it records. It confirms that the ' +
      'vehicle is recorded with the Union and states that it is not evidence of ownership, ' +
      'roadworthiness, licensing, or insurance. It carries no QR code. Audited as an export.',
    responses: {
      404: 'No such vehicle, no letter yet, or the vehicle lies outside the caller’s scope.',
    },
  })
  async letter(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const userId = request.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }
    const { bytes, filename } = await this.letters.render(userId, id, {
      ipAddress: request.ip,
      requestId: request.header('x-request-id'),
    });

    response.setHeader('X-Content-Type-Options', 'nosniff');
    // A member's name and number. Never held by a shared proxy.
    response.setHeader('Cache-Control', 'no-store');

    // `StreamableFile`, never a bare Buffer (CLAUDE.md): Nest would serialise
    // a Buffer as JSON under a 200.
    return new StreamableFile(Buffer.from(bytes), {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @RequirePermission('sticker.attach')
  @Post(':id/letter/reissue')
  @Documented({
    summary: "Reissue the vehicle's letter.",
    description:
      'QUESTIONS.md VEH-27 — a fresh letter, under a new reference, from the vehicle as it ' +
      'stands now: after a driver is linked, or the vehicle moves unit. Needs `sticker.attach` ' +
      'over the vehicle and a reason. The letter it replaces is kept exactly as printed, ' +
      'marked superseded, and no longer downloads. Audited with the reason.',
    body: reissueVehicleLetterSchema,
    responses: {
      404: 'No such vehicle, no letter yet, or the vehicle lies outside the caller’s scope.',
      409: 'The letter was reissued by someone else a moment ago.',
    },
  })
  async reissue(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reissueVehicleLetterSchema))
    body: ReissueVehicleLetterInput,
  ) {
    const userId = request.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }
    return {
      letter: await this.letters.reissue(userId, id, body.reason, {
        ipAddress: request.ip,
        requestId: resolveRequestId(request.header('x-request-id')),
      }),
    };
  }
}
