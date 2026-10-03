import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { verifySchema, type VerifyInput } from '@nurtw/contracts';

import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { resolveRequestId } from '../common/error-response.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Documented } from '../docs/documented.decorator.js';
import { VerificationService } from './verification.service.js';

/**
 * Internal verification (PRD §11 — item 10): the dashboard and the officer
 * portal. The external API (item 12) is a separate surface, authenticated by
 * API token, and never answers with this response.
 */
@Controller('verifications')
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @RequirePermission('verification.perform')
  @Post()
  @HttpCode(200)
  @Documented({
    summary: 'Verify a vehicle by plate, by sticker, or both (internal).',
    description:
      'PRD §11. Send `plateNumber`, `stickerCode`, or both; which are present decides the ' +
      'check. A plate matches a vehicle that is declared and onboarded; a sticker matches when ' +
      'it is attached, ACTIVE, and on a declared vehicle; together, the sticker must also be on ' +
      "the presented plate's vehicle. A signed code is checked before any lookup, and a failure " +
      'is audited as `verification.invalid_signature`. The internal answer gives every reason ' +
      "behind a negative verdict and, beside it, dues within the caller's read scope " +
      '(Requirement 27.8). Read-only apart from its audit event, which the `reference` names. ' +
      'Not organisation-scoped: an officer checks whatever vehicle is in front of them.',
    body: verifySchema,
    responses: {
      503: 'A signed sticker was presented, but the signing secret is not configured.',
    },
  })
  async verify(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(verifySchema)) body: VerifyInput,
  ) {
    const userId = request.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }
    return {
      verification: await this.verification.verify(userId, body, {
        requestId: resolveRequestId(request.header('x-request-id')),
        ipAddress: request.ip,
      }),
    };
  }
}
