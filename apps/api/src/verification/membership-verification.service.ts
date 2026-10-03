import { ForbiddenException, Injectable } from '@nestjs/common';
import type {
  InternalMembershipVerification,
  VerifyMembershipInput,
} from '@nurtw/contracts';
import {
  LIVE_CARD_STATUSES,
  MEMBERSHIP_LIMITATION,
  MEMBERSHIP_MATCH_STATEMENT,
  NO_MATCH_STATEMENT,
  decideMembershipVerification,
  parseIdentifier,
  projectVerification,
  type VerificationField,
  type VerificationValues,
} from '@nurtw/domain';
import type { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service.js';
import { PermissionService } from '../auth/permission.service.js';
import { DuesService } from '../payments/dues.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { VerificationRequestMeta } from './verification.service.js';

const VERIFY_MEMBERSHIP = 'verification.membership';
const READ_MEMBER = 'member.read';

/**
 * What a membership check reads of a card. Never the printed address, photo,
 * or signatures: acceptance criterion 12 holds because they are not selected.
 */
const CARD_SELECT = {
  id: true,
  cardNumber: true,
  status: true,
  expiryDate: true,
  memberId: true,
} satisfies Prisma.CardSelect;

/** What a membership check reads of a member. No contact, kin, or guarantor. */
const MEMBER_SELECT = {
  id: true,
  firstName: true,
  surname: true,
  membershipNumber: true,
  status: true,
  designation: { select: { label: true } },
  organisation: { select: { name: true, path: true } },
} satisfies Prisma.MemberSelect;

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
 * member's fee appears beside the verdict only within `member.read`.
 */
@Injectable()
export class MembershipVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
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

    // The schema has already checked the check character; this only puts the
    // number in the stored form.
    const number = parseIdentifier(input.number);

    // Card numbers and membership numbers share one format, so a number is
    // tried as a card first: a card says more than a membership does.
    const card = await this.prisma.card.findUnique({
      where: { cardNumber: number },
      select: CARD_SELECT,
    });
    const member = card
      ? await this.prisma.member.findUnique({
          where: { id: card.memberId },
          select: MEMBER_SELECT,
        })
      : await this.prisma.member.findUnique({
          where: { membershipNumber: number },
          select: MEMBER_SELECT,
        });
    const foundAs = card ? 'CARD_NUMBER' : member ? 'MEMBERSHIP_NUMBER' : null;

    // For a membership number, the card shown is the member's current one.
    const shownCard =
      card ??
      (member
        ? await this.prisma.card.findFirst({
            where: {
              memberId: member.id,
              status: { in: [...LIVE_CARD_STATUSES] },
            },
            orderBy: { issueDate: 'desc' },
            select: CARD_SELECT,
          })
        : null);

    const verdict = decideMembershipVerification({
      foundAs,
      member: member ? { status: member.status } : null,
      card: card ? { status: card.status, expiryDate: card.expiryDate } : null,
      now,
    });

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

    const values: VerificationValues = {
      member_name: member ? `${member.firstName} ${member.surname}` : null,
      membership_number: member?.membershipNumber ?? null,
      membership_status: member?.status ?? null,
      card_number: shownCard?.cardNumber ?? null,
      card_status: shownCard?.status ?? null,
      card_expiry_date: shownCard?.expiryDate?.toISOString() ?? null,
      designation: member?.designation?.label ?? null,
      organizational_unit: member?.organisation.name ?? null,
      // A vehicle check's fields; a membership check never permits them.
      plate_number: null,
      vehicle_category: null,
      sticker_status: null,
      attached_at: null,
      plate_matches_sticker: null,
      declaration_status: null,
      onboarded_at: null,
      identifier_scheme: null,
      registered_plate: null,
      sticker_plate: null,
      make: null,
      model: null,
      color: null,
      route_type: null,
      vehicle_id: null,
      member_status: null,
    };

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
        ...(foundAs === null ? { presentedNumber: number } : {}),
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
        values,
        foundAs ? MEMBERSHIP_FIELDS : [],
        'INTERNAL',
      ),
      dues: { member: memberDues },
    };
  }
}
