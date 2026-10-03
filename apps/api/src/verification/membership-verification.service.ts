import { ForbiddenException, Injectable } from '@nestjs/common';
import type {
  InternalMembershipVerification,
  VerifyMembershipInput,
} from '@nurtw/contracts';
import {
  MEMBERSHIP_LIMITATION,
  MEMBERSHIP_MATCH_STATEMENT,
  NO_MATCH_STATEMENT,
  projectVerification,
  type VerificationField,
} from '@nurtw/domain';

import { AuditService } from '../audit/audit.service.js';
import { PermissionService } from '../auth/permission.service.js';
import { DuesService } from '../payments/dues.service.js';
import { VerificationRecordsService } from './verification-records.service.js';
import type { VerificationRequestMeta } from './verification.service.js';

const VERIFY_MEMBERSHIP = 'verification.membership';
const READ_MEMBER = 'member.read';

/**
 * What every membership check may show. The name is here, unlike on a vehicle
 * check, because it is part of what is being verified: the officer compares it
 * with the name on the card in their hand, which is how a genuine number
 * copied onto someone else's card is caught.
 */
const MEMBERSHIP_FIELDS: readonly VerificationField[] = [
  'member_name',
  'membership_number',
  'membership_status',
  'card_number',
  'card_status',
  'card_expiry_date',
  'designation',
  'organizational_unit',
];

/**
 * Internal membership verification (item 24): the card a driver shows, by its
 * card number or its membership number.
 *
 * Read-only apart from its audit event, like every check in this module, and
 * not organisation-scoped: an officer checks whoever is in front of them. The
 * member's fee appears beside the verdict only within `member.read`. The
 * records and the verdict come from `VerificationRecordsService`, which the
 * external API (item 12) uses too.
 */
@Injectable()
export class MembershipVerificationService {
  constructor(
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
    private readonly records: VerificationRecordsService,
    private readonly dues: DuesService,
  ) {}

  async verify(
    userId: string,
    input: VerifyMembershipInput,
    meta: VerificationRequestMeta,
    now = new Date(),
  ): Promise<InternalMembershipVerification> {
    if (!(await this.permissions.canAnywhere(userId, VERIFY_MEMBERSHIP))) {
      throw new ForbiddenException();
    }

    const check = await this.records.membershipCheck(input.number, now);
    const { card, member, foundAs, verdict } = check;

    const memberReadable =
      member !== null &&
      (await this.permissions.can(
        userId,
        READ_MEMBER,
        member.organisation.path,
      ));
    const memberDues =
      member && memberReadable
        ? await this.dues.memberDues(member.id, now)
        : null;

    await this.audit.record({
      action: 'verification.membership',
      subjectType: card ? 'card' : member ? 'member' : 'verification',
      subjectId: card?.id ?? member?.id ?? null,
      actorUserId: userId,
      requestId: meta.requestId,
      ipAddress: meta.ipAddress,
      after: {
        outcome: verdict.matched ? 'MATCH' : 'NOT_VERIFIED',
        reasons: [...verdict.reasons],
        foundAs,
        ...(member ? { memberId: member.id } : {}),
        // A number that answers to nothing is kept, so a run of guesses shows.
        ...(foundAs === null ? { presentedNumber: check.number } : {}),
      },
    });

    return {
      reference: meta.requestId,
      verifiedAt: now.toISOString(),
      foundAs,
      matched: verdict.matched,
      reasons: verdict.reasons,
      statement: verdict.matched
        ? MEMBERSHIP_MATCH_STATEMENT
        : NO_MATCH_STATEMENT,
      limitation: MEMBERSHIP_LIMITATION,
      // The fields describe what was found; with nothing found there is
      // nothing to describe.
      fields: projectVerification(
        this.records.membershipValues(check),
        foundAs ? MEMBERSHIP_FIELDS : [],
        'INTERNAL',
      ),
      dues: { member: memberDues },
    };
  }
}
