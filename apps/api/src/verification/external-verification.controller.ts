import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  UseInterceptors,
} from '@nestjs/common';
import {
  externalCombinedVerificationSchema,
  externalMembershipVerificationSchema,
  externalPlateVerificationSchema,
  externalStickerVerificationSchema,
  type ExternalCombinedVerificationInput,
  type ExternalMembershipVerificationInput,
  type ExternalPlateVerificationInput,
  type ExternalStickerVerificationInput,
  type ExternalVerificationResponse,
} from '@nurtw/contracts';

import { ExternalRequestLogInterceptor } from '../api-client/external-request-log.interceptor.js';
import {
  RequireScope,
  type AuthenticatedApiClient,
  type ExternalRequest,
} from '../auth/require-scope.decorator.js';
import { resolveRequestId } from '../common/error-response.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Documented } from '../docs/documented.decorator.js';
import {
  ExternalVerificationService,
  type ExternalVerificationResult,
} from './external-verification.service.js';
import type { VerificationRequestMeta } from './verification.service.js';

const ANSWER =
  'Answers 200 with `result` `MATCH_FOUND` or `NO_MATCH_FOUND`. A non-match is the same ' +
  'answer whatever the reason, and carries no record field. A match carries `record_type` ' +
  'and only those fields this check may carry that the organisation’s disclosure profile ' +
  'permits. Every answer states the matter verified and what a match does not establish. ' +
  'No answer carries a reason, a declaration status, or dues (PRD Requirement 12.7).';

/**
 * The external verification API (PRD §12, proposal §12.3 — item 12).
 *
 * Reached by API token only: each route names a scope, so the guard reads the
 * `Authorization` header and never a session (Decision 9.10). Every request
 * that passes the guard is logged by `ExternalRequestLogInterceptor`.
 *
 * Identifiers travel in the body, never the URL (Requirement 12.3).
 */
@Controller('verification')
@UseInterceptors(ExternalRequestLogInterceptor)
export class ExternalVerificationController {
  constructor(private readonly external: ExternalVerificationService) {}

  @RequireScope('vehicle:verify:plate')
  @Post('vehicle/plate')
  @HttpCode(200)
  @Documented({
    summary: 'Verify a vehicle by its plate number.',
    description:
      'A plate matches a vehicle that is declared and has had a sticker attached. Send ' +
      '`plate_number` as written; it is compared in normalised form. Fields a match may carry: ' +
      '`plate_number`, `vehicle_category`, `sticker_status`, `organizational_unit`, ' +
      `\`attached_at\`. ${ANSWER}`,
    body: externalPlateVerificationSchema,
  })
  async plate(
    @Req() request: ExternalRequest,
    @Body(new ZodValidationPipe(externalPlateVerificationSchema))
    body: ExternalPlateVerificationInput,
  ): Promise<ExternalVerificationResponse> {
    return this.send(
      request,
      await this.external.verifyVehicle(
        this.client(request),
        'PLATE',
        { plateNumber: body.plate_number, stickerCode: null },
        this.meta(request),
      ),
    );
  }

  @RequireScope('sticker:verify:qr')
  @Post('sticker/qr')
  @HttpCode(200)
  @Documented({
    summary: 'Verify a sticker by its code.',
    description:
      'Send `sticker_qr_id`: what the sticker’s QR code holds, or the number on a legacy ' +
      'sticker. A sticker matches when it is attached, active, and on a declared vehicle. A ' +
      'signed code is checked before anything is looked up. Fields a match may carry: ' +
      '`vehicle_category`, `sticker_status`, `organizational_unit`, `attached_at`; never the ' +
      `plate. ${ANSWER}`,
    body: externalStickerVerificationSchema,
    responses: {
      503: 'A signed code was presented, and signed codes cannot be checked at present.',
    },
  })
  async sticker(
    @Req() request: ExternalRequest,
    @Body(new ZodValidationPipe(externalStickerVerificationSchema))
    body: ExternalStickerVerificationInput,
  ): Promise<ExternalVerificationResponse> {
    return this.send(
      request,
      await this.external.verifyVehicle(
        this.client(request),
        'STICKER',
        { plateNumber: null, stickerCode: body.sticker_qr_id },
        this.meta(request),
      ),
    );
  }

  @RequireScope('vehicle:verify:combined')
  @Post('vehicle/combined')
  @HttpCode(200)
  @Documented({
    summary: 'Verify a plate and a sticker together.',
    description:
      'Matches only when the sticker would match on its own and is attached to the vehicle ' +
      'carrying the presented plate, so a sticker moved to another vehicle does not match. ' +
      'Fields a match may carry: `plate_number`, `vehicle_category`, `sticker_status`, ' +
      `\`organizational_unit\`, \`attached_at\`, \`plate_matches_sticker\`. ${ANSWER}`,
    body: externalCombinedVerificationSchema,
    responses: {
      503: 'A signed code was presented, and signed codes cannot be checked at present.',
    },
  })
  async combined(
    @Req() request: ExternalRequest,
    @Body(new ZodValidationPipe(externalCombinedVerificationSchema))
    body: ExternalCombinedVerificationInput,
  ): Promise<ExternalVerificationResponse> {
    return this.send(
      request,
      await this.external.verifyVehicle(
        this.client(request),
        'COMBINED',
        { plateNumber: body.plate_number, stickerCode: body.sticker_qr_id },
        this.meta(request),
      ),
    );
  }

  @RequireScope('member:verify:membership')
  @Post('membership')
  @HttpCode(200)
  @Documented({
    summary: 'Verify a membership number or a card number.',
    description:
      'Send `number`, as printed on the card: its card number or its membership number. A ' +
      'membership number matches a member in good standing; a card number also needs the ' +
      'card to be active and in date. A mistyped number fails its check character and is ' +
      'refused as a bad request, before any lookup. Fields a match may carry: ' +
      '`membership_status`, `card_status`, `designation`, `organizational_unit`; never the ' +
      `member’s name or contact details. ${ANSWER}`,
    body: externalMembershipVerificationSchema,
  })
  async membership(
    @Req() request: ExternalRequest,
    @Body(new ZodValidationPipe(externalMembershipVerificationSchema))
    body: ExternalMembershipVerificationInput,
  ): Promise<ExternalVerificationResponse> {
    return this.send(
      request,
      await this.external.verifyMembership(
        this.client(request),
        body.number,
        this.meta(request),
      ),
    );
  }

  /** Hands the outcome to the request log, and the answer to the caller. */
  private send(
    request: ExternalRequest,
    result: ExternalVerificationResult,
  ): ExternalVerificationResponse {
    request.externalOutcome = result.outcome;
    return result.response;
  }

  /** Set by the guard on every scope route; its absence is a wiring fault. */
  private client(request: ExternalRequest): AuthenticatedApiClient {
    if (!request.apiClient) {
      throw new UnauthorizedException();
    }
    return request.apiClient;
  }

  private meta(request: ExternalRequest): VerificationRequestMeta {
    const supplied = request.headers['x-request-id'];
    return {
      requestId: resolveRequestId(
        Array.isArray(supplied) ? supplied[0] : supplied,
      ),
      ipAddress: request.ip,
    };
  }
}
