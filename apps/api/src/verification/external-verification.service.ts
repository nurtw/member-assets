import { Injectable } from '@nestjs/common';
import type { ExternalVerificationResponse } from '@nurtw/contracts';
import {
  EXTERNAL_RECORD_TYPES,
  externalCheckFields,
  externalLimitation,
  externalStatement,
  normalizePlateNumber,
  projectVerification,
  type ExternalCheck,
  type ProjectedVerification,
} from '@nurtw/domain';

import { AuditService } from '../audit/audit.service.js';
import type {
  AuthenticatedApiClient,
  ExternalOutcome,
} from '../auth/require-scope.decorator.js';
import { VerificationRecordsService } from './verification-records.service.js';
import type { VerificationRequestMeta } from './verification.service.js';

/** The answer, and the outcome the request log records beside it. */
export interface ExternalVerificationResult {
  response: ExternalVerificationResponse;
  outcome: ExternalOutcome;
}

export type ExternalVehicleCheck = Exclude<ExternalCheck, 'MEMBERSHIP'>;

/**
 * The external verification API (PRD §12, proposal §12.3 — item 12).
 *
 * The records and the verdict come from `VerificationRecordsService`, exactly
 * as the internal checks get them. Then three things differ:
 *
 * - **The answer is MATCH_FOUND or NO_MATCH_FOUND.** Every non-match is the
 *   same answer whatever the reason: no record, not declared, not onboarded,
 *   a lost sticker, a legacy barcode never attached, a plate that does not
 *   match, a forged code (Decision 5.4, Requirements 11.2 and 14.3).
 * - **A match carries only what this check may carry and the organisation's
 *   profile permits**, projected on the `EXTERNAL` channel, which drops any
 *   internal-only field whatever the profile says (Decision 5.1).
 * - **The audit event names the organisation** in place of an officer, and
 *   keeps the true reasons and the names of the fields disclosed.
 *
 * Read-only apart from that audit event, like every check in this module.
 */
@Injectable()
export class ExternalVerificationService {
  constructor(
    private readonly records: VerificationRecordsService,
    private readonly audit: AuditService,
  ) {}

  async verifyVehicle(
    client: AuthenticatedApiClient,
    check: ExternalVehicleCheck,
    input: { plateNumber: string | null; stickerCode: string | null },
    meta: VerificationRequestMeta,
    now = new Date(),
  ): Promise<ExternalVerificationResult> {
    const presentedPlate = input.plateNumber
      ? normalizePlateNumber(input.plateNumber)
      : null;
    // For abuse detection (item 13). A signed code, which holds a `.`, is in
    // no sequence: only a legacy barcode is passed.
    const presented = {
      plate: presentedPlate,
      code:
        input.stickerCode && !input.stickerCode.includes('.')
          ? input.stickerCode
          : null,
    };
    const found = await this.records.vehicleCheck({
      criteria: check,
      presentedPlate,
      stickerCode: input.stickerCode,
    });

    // Requirement 26.1 — a forged code is recorded as a forgery attempt. The
    // organisation is told no more than it would be about any other code.
    if (!found.codeValid) {
      await this.audit.record({
        action: 'verification.external.invalid_signature',
        subjectType: 'sticker',
        requestId: meta.requestId,
        ipAddress: meta.ipAddress,
        after: {
          ...this.who(client),
          check,
          presentedCode: input.stickerCode,
          ...(presentedPlate ? { presentedPlate } : {}),
        },
      });
      return {
        response: this.answer(check, false, {}, meta, now),
        outcome: {
          resultClass: 'INVALID_SIGNATURE',
          identifierScheme: found.scheme,
          presented,
        },
      };
    }

    const { vehicle, sticker, verdict } = found;
    const fields = projectVerification(
      this.records.vehicleValues(found),
      verdict.matched ? externalCheckFields(check, client.permittedFields) : [],
      'EXTERNAL',
    );

    await this.audit.record({
      action: `verification.external.${check.toLowerCase()}`,
      subjectType: vehicle ? 'vehicle' : sticker ? 'sticker' : 'verification',
      subjectId: vehicle?.id ?? sticker?.id ?? null,
      requestId: meta.requestId,
      ipAddress: meta.ipAddress,
      after: {
        ...this.who(client),
        outcome: verdict.matched ? 'MATCH' : 'NOT_VERIFIED',
        reasons: [...verdict.reasons],
        // PRD §26.4 — the scheme the presented code used; `null` for a plate.
        scheme: found.scheme,
        disclosed: Object.keys(fields),
        ...(sticker ? { stickerId: sticker.id } : {}),
        ...(presentedPlate ? { presentedPlate } : {}),
        ...(input.stickerCode && !sticker
          ? { presentedCode: input.stickerCode }
          : {}),
      },
    });

    return {
      response: this.answer(check, verdict.matched, fields, meta, now),
      outcome: {
        resultClass: verdict.matched ? 'MATCH' : 'NO_MATCH',
        identifierScheme: found.scheme,
        presented,
      },
    };
  }

  async verifyMembership(
    client: AuthenticatedApiClient,
    number: string,
    meta: VerificationRequestMeta,
    now = new Date(),
  ): Promise<ExternalVerificationResult> {
    const found = await this.records.membershipCheck(number, now);
    const { card, member, foundAs, verdict } = found;
    const fields = projectVerification(
      this.records.membershipValues(found),
      verdict.matched
        ? externalCheckFields('MEMBERSHIP', client.permittedFields)
        : [],
      'EXTERNAL',
    );

    await this.audit.record({
      action: 'verification.external.membership',
      subjectType: card ? 'card' : member ? 'member' : 'verification',
      subjectId: card?.id ?? member?.id ?? null,
      requestId: meta.requestId,
      ipAddress: meta.ipAddress,
      after: {
        ...this.who(client),
        outcome: verdict.matched ? 'MATCH' : 'NOT_VERIFIED',
        reasons: [...verdict.reasons],
        foundAs,
        disclosed: Object.keys(fields),
        ...(member ? { memberId: member.id } : {}),
        // A number that answers to nothing is kept, so a run of guesses shows.
        ...(foundAs === null ? { presentedNumber: found.number } : {}),
      },
    });

    return {
      response: this.answer('MEMBERSHIP', verdict.matched, fields, meta, now),
      outcome: {
        resultClass: verdict.matched ? 'MATCH' : 'NO_MATCH',
        identifierScheme: null,
      },
    };
  }

  /** Who asked: the organisation and its token, by id. Never the token. */
  private who(client: AuthenticatedApiClient) {
    return {
      channel: 'EXTERNAL',
      clientId: client.clientId,
      tokenId: client.tokenId,
    };
  }

  /**
   * The answer. Built from the envelope and the projected fields alone, so
   * nothing about a non-match can differ but the request id and the times.
   */
  private answer(
    check: ExternalCheck,
    matched: boolean,
    fields: ProjectedVerification,
    meta: VerificationRequestMeta,
    now: Date,
  ): ExternalVerificationResponse {
    const at = now.toISOString();
    return {
      request_id: meta.requestId,
      result: matched ? 'MATCH_FOUND' : 'NO_MATCH_FOUND',
      ...(matched ? { record_type: EXTERNAL_RECORD_TYPES[check] } : {}),
      statement: externalStatement(check, matched),
      ...fields,
      limitation: externalLimitation(check),
      verified_at: at,
      // Read live, never from a cache, so the data is as of the check.
      data_as_of: at,
    };
  }
}
