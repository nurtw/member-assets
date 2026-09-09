import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CardDetail,
  CardSummary,
  DecideCardInput,
  DraftCardInput,
  ReplaceCardInput,
  SetCardStatusInput,
  UpdateCardInput,
} from '@nurtw/contracts';
import {
  InvalidCardTransitionError,
  assertCardTransition,
  expiryDateFor,
  generateIdentifier,
  isCardReplaceable,
  isMemberInGoodStanding,
  outermostScopes,
  type CardStatus,
  type MemberStatus,
} from '@nurtw/domain';
import type { Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';

import { AuditService } from '../audit/audit.service.js';
import { PermissionService } from '../auth/permission.service.js';
import { MediaService } from '../media/media.service.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  RENDERABLE_IMAGE_TYPES,
  type CardRenderInput,
  type EmbeddableImage,
  type OfficerSignatureOnCard,
} from './templates/template.js';
import { CURRENT_TEMPLATE_VERSION, templateFor } from './templates/registry.js';

const READ = 'card.read';
const ISSUE = 'card.issue';
const APPROVE = 'card.approve';
const REPLACE = 'card.replace';
const SUSPEND = 'card.suspend';

/** Attempts before a card-number collision is treated as a real fault. */
const IDENTIFIER_ATTEMPTS = 5;

/**
 * Membership cards (PRD §8).
 *
 * **Record-scoped throughout**, exactly as `MembershipService` is: every method
 * resolves the card holder's organisation path and asks `can` against it. The
 * guard has established only that the caller holds the permission *somewhere*.
 *
 * **The card module never reads `member_contact`, `next_of_kin`, or
 * `guarantor`.** Decision 10.1 keeps those apart from card-display data, and the
 * separation is structural rather than a matter of query discipline — the
 * printed address is the officer-composed one held on the card row itself, so
 * there is nothing here that *could* join the sensitive tables.
 *
 * See `plans/06-membership-card-issuance.md`.
 */
@Injectable()
export class CardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
  ) {}

  // --- Reads ---------------------------------------------------------------

  async list(
    userId: string,
    filters: { status?: string; memberId?: string },
  ): Promise<CardSummary[]> {
    const scopes = await this.readableScopes(userId);
    if (scopes.length === 0) {
      return [];
    }

    const rows = await this.prisma.card.findMany({
      where: {
        ...(filters.status ? { status: filters.status as never } : {}),
        ...(filters.memberId ? { memberId: filters.memberId } : {}),
        member: {
          organisation: {
            OR: scopes.map((path) => ({ path: { startsWith: path } })),
          },
        },
      },
      select: this.summarySelect(),
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return rows.map((row) => this.toSummary(row));
  }

  async findOne(userId: string, id: string): Promise<CardDetail> {
    // Authorisation first, then the fuller projection. The narrow select in
    // `loadVisible` is what decides visibility; this one is what is returned.
    await this.loadVisible(userId, id);

    const row = await this.prisma.card.findUniqueOrThrow({
      where: { id },
      select: {
        ...this.summarySelect(),
        printedName: true,
        printedAddress: true,
        printedDesignation: true,
        printedState: true,
        printedBranch: true,
        printedUnit: true,
        membershipNumber: true,
        replacementOfCardId: true,
        replacedBy: { select: { id: true } },
        issuedByUserId: true,
        approvedByUserId: true,
        createdAt: true,
      },
    });

    return {
      ...this.toSummary(row),
      printed: {
        name: row.printedName,
        address: row.printedAddress,
        designation: row.printedDesignation,
        state: row.printedState,
        branch: row.printedBranch,
        unit: row.printedUnit,
        membershipNumber: row.membershipNumber,
      },
      replacementOfCardId: row.replacementOfCardId,
      replacedByCardId: row.replacedBy?.id ?? null,
      issuedByUserId: row.issuedByUserId,
      approvedByUserId: row.approvedByUserId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // --- Preparation ---------------------------------------------------------

  /**
   * Prepares a card for a member.
   *
   * Requires `card.issue`, which prepares. Moving the card to `ISSUED` requires
   * `card.approve`, which is a different permission held by a different officer
   * — the same separation as `member.create` and `application.decide` in item
   * 05. The officer who prepares a card cannot approve their own preparation.
   */
  async draft(actor: ActorContext, input: DraftCardInput): Promise<CardSummary> {
    const member = await this.loadMember(input.memberId);
    await this.require(actor.userId, ISSUE, member.organisation.path);

    this.assertGoodStanding(member.status as MemberStatus);
    await this.assertNoOtherPreparation(member.id);

    const templateVersion = input.templateVersion ?? CURRENT_TEMPLATE_VERSION;
    // Fails now rather than at print time, when the officer is at a counter.
    templateFor(templateVersion);

    const defaults = await this.printedDefaults(member.id);

    const created = await this.prisma.$transaction(async (tx) => {
      const card = await tx.card.create({
        data: {
          memberId: member.id,
          status: 'DRAFT',
          templateVersion,
          // PRD Requirement 8.1 wants the issuing user *and* the approving
          // officer. The issuing user is whoever prepared the card, recorded
          // here; the approver is recorded at approval. Setting both to the
          // approver would lose the separation the requirement asks for, and
          // with it the record of who prepared a card that turned out wrong.
          issuedByUserId: actor.userId,
          // No card number: allocated at issuance (item plan, decision 3).
          printedName: input.printedName ?? defaults.name,
          printedAddress: input.printedAddress,
          printedDesignation: input.printedDesignation ?? defaults.designation,
          printedState: input.printedState ?? defaults.state,
          printedBranch: input.printedBranch ?? defaults.branch,
          printedUnit: input.printedUnit ?? defaults.unit,
          membershipNumber: member.membershipNumber,
        },
        select: this.summarySelect(),
      });

      await this.audit.record(
        {
          action: 'card.draft',
          subjectType: 'card',
          subjectId: card.id,
          organisationId: member.organisationId,
          actorUserId: actor.userId,
          // The printed values are card-display data, which is what an audit of
          // a card issuance is actually about. No contact data reaches here
          // because none reaches this module.
          after: {
            status: 'DRAFT',
            templateVersion,
            memberId: member.id,
            membershipNumber: member.membershipNumber,
          },
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return card;
    });

    return this.toSummary(created);
  }

  async update(
    actor: ActorContext,
    id: string,
    input: UpdateCardInput,
  ): Promise<CardSummary> {
    const card = await this.loadVisible(actor.userId, id);
    await this.require(actor.userId, ISSUE, card.member.organisation.path);

    if (card.status !== 'DRAFT') {
      // Same rule as an application under review: amending what the approver is
      // looking at means the decision in the audit trail refers to something
      // other than what was decided upon. A card already issued is a physical
      // object, and amending its record would make the System describe something
      // other than what is in the member's pocket.
      throw new ConflictException(
        `A card in ${card.status} can no longer be amended. ` +
          'Replace it instead, which supersedes it and preserves the relationship.',
      );
    }

    if (input.templateVersion) {
      templateFor(input.templateVersion);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.card.update({
        where: { id },
        data: {
          ...(input.printedName !== undefined
            ? { printedName: input.printedName }
            : {}),
          ...(input.printedAddress !== undefined
            ? { printedAddress: input.printedAddress }
            : {}),
          ...(input.printedDesignation !== undefined
            ? { printedDesignation: input.printedDesignation }
            : {}),
          ...(input.printedState !== undefined
            ? { printedState: input.printedState }
            : {}),
          ...(input.printedBranch !== undefined
            ? { printedBranch: input.printedBranch }
            : {}),
          ...(input.printedUnit !== undefined
            ? { printedUnit: input.printedUnit }
            : {}),
          ...(input.templateVersion !== undefined
            ? { templateVersion: input.templateVersion }
            : {}),
        },
        select: this.summarySelect(),
      });

      await this.audit.record(
        {
          action: 'card.update',
          subjectType: 'card',
          subjectId: id,
          organisationId: card.member.organisationId,
          actorUserId: actor.userId,
          after: { fieldsAmended: Object.keys(input) },
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return row;
    });

    return this.toSummary(updated);
  }

  /** Sends a prepared card for approval. */
  async submitForApproval(
    actor: ActorContext,
    id: string,
  ): Promise<CardSummary> {
    const card = await this.loadVisible(actor.userId, id);
    await this.require(actor.userId, ISSUE, card.member.organisation.path);
    this.assertTransition(card.status as CardStatus, 'PENDING_APPROVAL');

    return this.applyStatus(actor, card, 'PENDING_APPROVAL', {
      action: 'card.submit_for_approval',
    });
  }

  // --- Issuance ------------------------------------------------------------

  /**
   * Approves a card for issuance, or returns it for amendment.
   *
   * Issuance is the **only** place a card number is allocated, and it happens in
   * the same transaction as the status change — so a card can never be `ISSUED`
   * without a number, nor hold a number without an issuance recorded against it.
   *
   * The photograph, holder signature, and officer signatures are snapshotted
   * here too. This is the moment the physical artifact is produced, and from
   * here on the card row describes what was printed rather than what the member
   * record currently says.
   */
  async decide(
    actor: ActorContext,
    id: string,
    input: DecideCardInput,
  ): Promise<CardSummary> {
    const card = await this.loadVisible(actor.userId, id);
    await this.require(actor.userId, APPROVE, card.member.organisation.path);
    this.assertTransition(card.status as CardStatus, input.decision);

    if (input.decision === 'DRAFT') {
      return this.applyStatus(actor, card, 'DRAFT', {
        action: 'card.return_for_amendment',
        reason: input.reason ?? null,
      });
    }

    // Re-checked at issuance, not merely at preparation: the two can be days
    // apart, and a member suspended in between must not walk away with a card.
    const member = await this.loadMember(card.memberId);
    this.assertGoodStanding(member.status as MemberStatus);

    const template = templateFor(card.templateVersion);
    const issueDate = new Date();
    const expiryDate = expiryDateFor(issueDate, template.validityMonths);

    const signatures = await this.activeOfficerSignatures();

    const updated = await this.prisma.$transaction(async (tx) => {
      const cardNumber = await this.allocateCardNumber(tx);

      const row = await tx.card.update({
        where: { id },
        data: {
          status: 'ISSUED',
          cardNumber,
          issueDate,
          expiryDate,
          // The approving officer. The issuing user was recorded when the card
          // was prepared (Requirement 8.1 wants both, and they are different
          // people — `card.issue` and `card.approve` are separate permissions).
          approvedByUserId: actor.userId,
          // The snapshot. Never recomputed afterwards.
          membershipNumber: member.membershipNumber,
          printedPhotoId: member.passportPhotoId,
          printedSignatureId: member.signatureId,
          presidentSignatureId: signatures.PRESIDENT?.id ?? null,
          generalSecretarySignatureId: signatures.GENERAL_SECRETARY?.id ?? null,
        },
        select: this.summarySelect(),
      });

      await this.audit.record(
        {
          action: 'card.issue',
          subjectType: 'card',
          subjectId: id,
          organisationId: card.member.organisationId,
          actorUserId: actor.userId,
          reason: input.reason ?? null,
          before: { status: card.status, cardNumber: null },
          after: {
            status: 'ISSUED',
            cardNumber,
            templateVersion: card.templateVersion,
            issueDate: issueDate.toISOString(),
            expiryDate: expiryDate?.toISOString() ?? null,
            // Recorded because CARD-07 is open: until the Union supplies the
            // signature images, cards issue with blank officer signature lines,
            // and the trail should say which cards those were.
            officerSignaturesPresent:
              signatures.PRESIDENT !== null &&
              signatures.GENERAL_SECRETARY !== null,
          },
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return row;
    });

    return this.toSummary(updated);
  }

  /**
   * Records that an issued card has been handed to its holder.
   *
   * `ISSUED → ACTIVE`, under `card.issue`. Separate from {@link setStatus}
   * because it is a different authority: completing an issuance belongs to
   * whoever issues, not to whoever may suspend. The guard refuses on the route's
   * declared permission before the service is reached, so a single route could
   * not have made the permission depend on the transition.
   */
  async activate(actor: ActorContext, id: string): Promise<CardSummary> {
    const card = await this.loadVisible(actor.userId, id);
    await this.require(actor.userId, ISSUE, card.member.organisation.path);
    this.assertTransition(card.status as CardStatus, 'ACTIVE');

    return this.applyStatus(actor, card, 'ACTIVE', { action: 'card.activate' });
  }

  /**
   * Suspend, restore, or retire a card.
   *
   * `ISSUED` and `REPLACED` are deliberately unreachable here: the first is
   * reached by approval, which allocates a number, and the second by
   * replacement, which supersedes. Routing either through a general status
   * setter would let a caller reach the effect without the work.
   *
   * `ACTIVE` here means **restoring a suspended card**. Handing an issued card
   * over is {@link activate}, under a different permission.
   */
  async setStatus(
    actor: ActorContext,
    id: string,
    input: SetCardStatusInput,
  ): Promise<CardSummary> {
    const card = await this.loadVisible(actor.userId, id);
    const from = card.status as CardStatus;

    await this.require(actor.userId, SUSPEND, card.member.organisation.path);

    if (input.status === 'ACTIVE' && from === 'ISSUED') {
      throw new ConflictException(
        'Handing an issued card to its holder is a separate act. ' +
          'Use the activation endpoint, which requires card.issue.',
      );
    }

    this.assertTransition(from, input.status);

    return this.applyStatus(actor, card, input.status, {
      action: `card.${input.status.toLowerCase()}`,
      reason: input.reason,
    });
  }

  /**
   * Replaces a card.
   *
   * The original moves to `REPLACED` and a fresh **draft** is created pointing
   * back at it, in one transaction. The replacement is a draft rather than an
   * issued card because issuance is a separate authority: a replacement that
   * issued itself would let `card.replace` mint credentials without `card.approve`.
   *
   * Both ends of the relationship survive (PRD Requirement 8.1). Nothing is
   * overwritten and nothing is deleted.
   *
   * **CARD-08 is open** — who authorises a replacement, and whether the original
   * is marked lost, void, or superseded. This implements superseding. If the
   * Union's answer differs it changes who may call this, not what it does.
   */
  async replace(
    actor: ActorContext,
    id: string,
    input: ReplaceCardInput,
  ): Promise<CardSummary> {
    const card = await this.loadVisible(actor.userId, id);
    await this.require(actor.userId, REPLACE, card.member.organisation.path);

    if (!isCardReplaceable(card.status as CardStatus)) {
      throw new ConflictException(
        `A card in ${card.status} cannot be replaced. ` +
          'Nothing was printed, or the card was deliberately voided.',
      );
    }

    const member = await this.loadMember(card.memberId);
    this.assertGoodStanding(member.status as MemberStatus);

    const original = await this.prisma.card.findUniqueOrThrow({
      where: { id },
      select: {
        printedName: true,
        printedAddress: true,
        printedDesignation: true,
        printedState: true,
        printedBranch: true,
        printedUnit: true,
      },
    });

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.card.update({
        where: { id },
        data: { status: 'REPLACED' },
      });

      const replacement = await tx.card.create({
        data: {
          memberId: card.memberId,
          status: 'DRAFT',
          // The current template, not the superseded card's: a replacement is a
          // new physical card and should carry the design in use today. The
          // superseded card keeps its own version, so it still re-renders as it
          // was printed.
          templateVersion: CURRENT_TEMPLATE_VERSION,
          replacementOfCardId: id,
          issuedByUserId: actor.userId,
          printedName: original.printedName,
          printedAddress: input.printedAddress ?? original.printedAddress,
          printedDesignation: original.printedDesignation,
          printedState: original.printedState,
          printedBranch: original.printedBranch,
          printedUnit: original.printedUnit,
          membershipNumber: member.membershipNumber,
        },
        select: this.summarySelect(),
      });

      await this.audit.record(
        {
          action: 'card.replace',
          subjectType: 'card',
          subjectId: id,
          organisationId: card.member.organisationId,
          actorUserId: actor.userId,
          reason: input.reason,
          before: { status: card.status },
          after: { status: 'REPLACED', replacedByCardId: replacement.id },
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return replacement;
    });

    return this.toSummary(created);
  }

  // --- Rendering -----------------------------------------------------------

  /**
   * The card as a PDF.
   *
   * Rendered through the template the card records, never the current one — a
   * silent fallback would reprint a card in a design the holder does not have,
   * and it would look correct, which is worse than an error.
   *
   * A card not yet issued renders as a proof: no number, and a diagonal
   * overprint. Without that the approval step is decorative.
   */
  async render(
    userId: string,
    id: string,
  ): Promise<{ bytes: Uint8Array; filename: string }> {
    await this.loadVisible(userId, id);

    const row = await this.prisma.card.findUniqueOrThrow({
      where: { id },
      select: {
        cardNumber: true,
        status: true,
        templateVersion: true,
        issueDate: true,
        expiryDate: true,
        printedName: true,
        printedAddress: true,
        printedDesignation: true,
        printedState: true,
        printedBranch: true,
        printedUnit: true,
        membershipNumber: true,
        printedPhotoId: true,
        printedSignatureId: true,
        presidentSignature: this.officerSignatureSelect(),
        generalSecretarySignature: this.officerSignatureSelect(),
        member: {
          select: { passportPhotoId: true, signatureId: true },
        },
      },
    });

    const issued = row.cardNumber !== null;

    // Before issuance nothing is snapshotted yet, so a proof shows the member's
    // current photograph — which is correct: a proof is a preview of what would
    // be printed today.
    const photoId = row.printedPhotoId ?? row.member.passportPhotoId;
    const signatureId = row.printedSignatureId ?? row.member.signatureId;

    const input: CardRenderInput = {
      cardNumber: row.cardNumber,
      issued,
      printedName: row.printedName ?? '',
      printedAddress: row.printedAddress ?? '',
      printedDesignation: row.printedDesignation ?? '',
      printedState: row.printedState ?? '',
      printedBranch: row.printedBranch ?? '',
      printedUnit: row.printedUnit ?? '',
      membershipNumber: row.membershipNumber ?? '',
      issueDate: row.issueDate,
      expiryDate: row.expiryDate,
      photo: await this.embeddable(photoId),
      holderSignature: await this.embeddable(signatureId),
      president: await this.officerOnCard(row.presidentSignature),
      generalSecretary: await this.officerOnCard(row.generalSecretarySignature),
    };

    const bytes = await templateFor(row.templateVersion).render(input);

    // Named by card number where there is one, and by nothing identifying where
    // there is not: a proof's filename should not carry the member's name into
    // whatever folder it is saved in.
    const filename = row.cardNumber
      ? `nurtw-card-${row.cardNumber}.pdf`
      : 'nurtw-card-proof.pdf';

    return { bytes, filename };
  }

  // --- Internals -----------------------------------------------------------

  private assertGoodStanding(status: MemberStatus): void {
    if (!isMemberInGoodStanding(status)) {
      // A card is Union credentials. Issuing one to a pending applicant grants
      // them to somebody the Union has not admitted; issuing one to a suspended
      // member restores by the back door what the suspension took away.
      throw new ConflictException(
        `A member in ${status} cannot hold a card. Only an active member may.`,
      );
    }
  }

  /**
   * Refuses a second card in preparation for the same member.
   *
   * The database enforces one *live* card per member, which covers `ISSUED` and
   * `ACTIVE`. It deliberately does not cover `DRAFT`, because a replacement
   * draft must be able to coexist with the card it supersedes for the moment
   * between the two writes. This check closes the remaining gap at the service
   * level: two drafts for one member would produce two cards nobody decided to
   * produce.
   */
  private async assertNoOtherPreparation(memberId: string): Promise<void> {
    const existing = await this.prisma.card.findFirst({
      where: {
        memberId,
        status: { in: ['DRAFT', 'PENDING_APPROVAL', 'ISSUED', 'ACTIVE'] },
      },
      select: { id: true, status: true },
    });
    if (existing) {
      throw new ConflictException(
        `This member already has a card in ${existing.status}. ` +
          'Replace it rather than preparing a second.',
      );
    }
  }

  private assertTransition(from: CardStatus, to: CardStatus): void {
    try {
      assertCardTransition(from, to);
    } catch (error) {
      if (error instanceof InvalidCardTransitionError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  private async applyStatus(
    actor: ActorContext,
    card: { id: string; status: string; member: { organisationId: string } },
    to: CardStatus,
    options: { action: string; reason?: string | null },
  ): Promise<CardSummary> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.card.update({
        where: { id: card.id },
        data: { status: to },
        select: this.summarySelect(),
      });

      await this.audit.record(
        {
          action: options.action,
          subjectType: 'card',
          subjectId: card.id,
          organisationId: card.member.organisationId,
          actorUserId: actor.userId,
          reason: options.reason ?? null,
          before: { status: card.status },
          after: { status: to },
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return row;
    });

    return this.toSummary(updated);
  }

  private async readableScopes(userId: string): Promise<string[]> {
    const held = await this.permissions.listFor(userId);
    return outermostScopes(
      held
        .filter((entry) => entry.permission === READ)
        .map((entry) => entry.scopePath),
    );
  }

  /**
   * Loads a card the caller may read, or 404.
   *
   * "Outside your scope" and "no such card" answer identically, so card
   * identifiers cannot be enumerated.
   */
  private async loadVisible(userId: string, id: string) {
    const card = await this.prisma.card.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        memberId: true,
        templateVersion: true,
        member: {
          select: {
            organisationId: true,
            organisation: { select: { path: true } },
          },
        },
      },
    });
    if (!card) {
      throw new NotFoundException();
    }
    if (!(await this.permissions.can(userId, READ, card.member.organisation.path))) {
      throw new NotFoundException();
    }
    return card;
  }

  private async loadMember(memberId: string) {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        status: true,
        membershipNumber: true,
        organisationId: true,
        passportPhotoId: true,
        signatureId: true,
        organisation: { select: { path: true } },
      },
    });
    if (!member) {
      throw new NotFoundException();
    }
    return member;
  }

  /**
   * The values printed on a card, defaulted from the member's record.
   *
   * Everything here is card-display data: name, designation, and the
   * organisational placement. The address is **not** defaulted — it lives in
   * `member_contact`, which this module must not read, so the officer composes
   * the card-display address instead (proposal §8: "may be shorter than the full
   * residential address").
   */
  private async printedDefaults(memberId: string): Promise<{
    name: string;
    designation: string;
    state: string;
    branch: string;
    unit: string;
  }> {
    const member = await this.prisma.member.findUniqueOrThrow({
      where: { id: memberId },
      select: {
        surname: true,
        firstName: true,
        middleName: true,
        designation: { select: { label: true } },
        organisation: { select: { name: true, level: true, path: true } },
      },
    });

    const ancestors = await this.ancestorsOf(member.organisation.path);

    return {
      name: [member.firstName, member.middleName, member.surname]
        .filter((part): part is string => Boolean(part && part.trim()))
        .join(' ')
        .toUpperCase(),
      // Blank until ORG-06 arrives: the Union has not supplied its designation
      // list, and `Member.designationId` is nullable in consequence.
      designation: member.designation?.label ?? '',
      /**
       * PRD Requirement 8.2 — the **issuing council's** state, never the
       * member's state of origin. Defaulted from the council node's name; the
       * officer may override, and ORG-05 will supply the Union's real names.
       */
      state: ancestors.get('COUNCIL') ?? '',
      branch: ancestors.get('BRANCH') ?? '',
      unit: ancestors.get('UNIT') ?? member.organisation.name,
    };
  }

  /** The names of every organisation on a member's path, keyed by level. */
  private async ancestorsOf(path: string): Promise<Map<string, string>> {
    const ids = path.split('/').filter((segment) => segment.length > 0);
    if (ids.length === 0) {
      return new Map();
    }
    const nodes = await this.prisma.organisation.findMany({
      where: { id: { in: ids } },
      select: { name: true, level: true },
    });
    return new Map(nodes.map((node) => [node.level, node.name]));
  }

  private officerSignatureSelect() {
    return {
      select: {
        officerName: true,
        officerTitle: true,
        mediaAssetId: true,
      },
    } as const;
  }

  /** The active signature for each position, or null where none is registered. */
  private async activeOfficerSignatures(): Promise<{
    PRESIDENT: { id: string } | null;
    GENERAL_SECRETARY: { id: string } | null;
  }> {
    const rows = await this.prisma.officerSignature.findMany({
      where: { isActive: true },
      select: { id: true, position: true },
    });
    return {
      PRESIDENT: rows.find((row) => row.position === 'PRESIDENT') ?? null,
      GENERAL_SECRETARY:
        rows.find((row) => row.position === 'GENERAL_SECRETARY') ?? null,
    };
  }

  private async officerOnCard(
    signature: {
      officerName: string;
      officerTitle: string;
      mediaAssetId: string;
    } | null,
  ): Promise<OfficerSignatureOnCard | null> {
    if (!signature) {
      return null;
    }
    return {
      officerName: signature.officerName,
      officerTitle: signature.officerTitle,
      image: await this.embeddable(signature.mediaAssetId),
    };
  }

  /**
   * Loads an image for embedding, or null.
   *
   * Null rather than an exception when the type cannot be embedded: `pdf-lib`
   * takes JPEG and PNG, the media module also accepts WebP, and converting would
   * mean a native image library in a container that has none. The issuance path
   * refuses a WebP photograph with an explanation; this is the second line, so
   * that an older asset cannot break a reprint years later.
   */
  private async embeddable(
    assetId: string | null,
  ): Promise<EmbeddableImage | null> {
    if (!assetId) {
      return null;
    }
    const asset = await this.media.readInternal(assetId);
    if (!asset || !RENDERABLE_IMAGE_TYPES.includes(asset.contentType)) {
      return null;
    }
    return { bytes: asset.bytes, contentType: asset.contentType };
  }

  private async require(
    userId: string,
    permission: string,
    path: string,
  ): Promise<void> {
    if (!(await this.permissions.can(userId, permission, path))) {
      throw new ForbiddenException();
    }
  }

  /**
   * A card number, retried on the vanishingly unlikely collision.
   *
   * Same treatment as the membership number: 31^12 possibilities against a
   * register of thousands, so a collision is essentially impossible — and
   * "essentially impossible" and "handled" differ by one failed issuance at a
   * counter with a member waiting.
   */
  private async allocateCardNumber(tx: Prisma.TransactionClient): Promise<string> {
    for (let attempt = 0; attempt < IDENTIFIER_ATTEMPTS; attempt++) {
      const candidate = generateIdentifier(() => randomInt(256));
      const clash = await tx.card.findUnique({
        where: { cardNumber: candidate },
        select: { id: true },
      });
      if (!clash) {
        return candidate;
      }
    }
    throw new ConflictException(
      'Could not allocate a card number. Please try again.',
    );
  }

  /**
   * The list projection.
   *
   * Fields named explicitly, never a spread — and note what is reachable from
   * here: the member's name, status, membership number, and organisation. There
   * is no route from this select to a telephone number, an address, a next of
   * kin, or a guarantor, because those tables are not joined anywhere in this
   * module.
   */
  private summarySelect() {
    return {
      id: true,
      cardNumber: true,
      status: true,
      templateVersion: true,
      issueDate: true,
      expiryDate: true,
      member: {
        select: {
          id: true,
          surname: true,
          firstName: true,
          middleName: true,
          status: true,
          membershipNumber: true,
          organisation: { select: { id: true, name: true, level: true } },
        },
      },
    } satisfies Prisma.CardSelect;
  }

  private toSummary(row: {
    id: string;
    cardNumber: string | null;
    status: string;
    templateVersion: string;
    issueDate: Date | null;
    expiryDate: Date | null;
    member: CardSummary['member'];
  }): CardSummary {
    return {
      id: row.id,
      cardNumber: row.cardNumber,
      status: row.status,
      templateVersion: row.templateVersion,
      issueDate: row.issueDate?.toISOString() ?? null,
      expiryDate: row.expiryDate?.toISOString() ?? null,
      member: row.member,
    };
  }
}
