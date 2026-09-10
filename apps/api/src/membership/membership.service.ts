import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ApplicationDetail,
  ApplicationSummary,
  AttachMediaInput,
  CreateApplicationInput,
  ReviewApplicationInput,
  SetMemberStatusInput,
  UpdateApplicationInput,
  WithdrawApplicationInput,
} from '@nurtw/contracts';
import {
  assertApplicationTransition,
  assertMemberTransition,
  generateIdentifier,
  InvalidStatusTransitionError,
  isApplicationEditable,
  outermostScopes,
  type ApplicationStatus,
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
  REQUIRE_SEPARATE_OFFICER,
  SettingsService,
} from '../settings/settings.service.js';
import {
  renderRegistrationForm,
  type FormSection,
} from './registration-form.js';

const READ = 'application.read';
const CREATE = 'member.create';
const DECIDE = 'application.decide';
const MEMBER_READ = 'member.read';
const MEMBER_SUSPEND = 'member.suspend';
const SENSITIVE_READ = 'member_sensitive.read';

/** Attempts before a membership-number collision is treated as a real fault. */
const IDENTIFIER_ATTEMPTS = 5;

/**
 * Membership registration (PRD §7).
 *
 * **Record-scoped throughout.** Every method resolves the applicant's
 * organisation path and asks `can` against it. The guard has established only
 * that the caller holds the permission *somewhere*; without the second check an
 * officer in one branch could read, amend, and approve another branch's
 * applicants — which is the whole personal-data surface of the Union.
 *
 * The applicant is a `member` row in `PENDING` from the outset, and
 * `membership_application` records the review rather than a second copy of the
 * form. See `plans/05-membership-application.md`.
 */
@Injectable()
export class MembershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    private readonly settings: SettingsService,
  ) {}

  // --- Reads ---------------------------------------------------------------

  /**
   * Applications the caller may see.
   *
   * Filtered by organisation subtree, not merely ordered by it. An unfiltered
   * list with client-side hiding would disclose every applicant in the Union to
   * any officer holding the most basic read permission.
   */
  async list(
    userId: string,
    filters: { status?: string; organisationId?: string },
  ): Promise<ApplicationSummary[]> {
    const scopes = await this.readableScopes(userId);
    if (scopes.length === 0) {
      return [];
    }

    const rows = await this.prisma.membershipApplication.findMany({
      where: {
        ...(filters.status ? { status: filters.status as never } : {}),
        member: {
          organisation: {
            AND: [
              { OR: scopes.map((path) => ({ path: { startsWith: path } })) },
              ...(filters.organisationId
                ? [{ id: filters.organisationId }]
                : []),
            ],
          },
        },
      },
      select: this.summarySelect(),
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return rows.map((row) => this.toSummary(row));
  }

  /** The full record, including the data Requirement 7.1 keeps separate. */
  async findOne(userId: string, id: string): Promise<ApplicationDetail> {
    const application = await this.loadVisible(userId, id);

    const member = await this.prisma.member.findUniqueOrThrow({
      where: { id: application.memberId },
      include: {
        organisation: { select: { id: true, name: true, level: true } },
        designation: { select: { id: true, code: true, label: true } },
        contact: { include: { residentialLga: true } },
        nextOfKin: { include: { lga: true } },
        guarantor: true,
      },
    });

    return {
      id: application.id,
      applicationNumber: application.applicationNumber,
      status: application.status,
      submittedAt: application.submittedAt?.toISOString() ?? null,
      reviewedAt: application.reviewedAt?.toISOString() ?? null,
      rejectionReason: application.rejectionReason,
      member: {
        id: member.id,
        surname: member.surname,
        firstName: member.firstName,
        middleName: member.middleName,
        status: member.status,
        membershipNumber: member.membershipNumber,
        organisation: member.organisation,
        designation: member.designation,
      },
      contact: member.contact
        ? {
            phone: member.contact.phone,
            residentialAddress: member.contact.residentialAddress,
            area: member.contact.area,
            townCity: member.contact.townCity,
            lga: member.contact.residentialLga
              ? {
                  id: member.contact.residentialLga.id,
                  name: member.contact.residentialLga.name,
                  stateName: member.contact.residentialLga.stateName,
                }
              : null,
            stateOfOrigin: member.contact.stateOfOrigin,
          }
        : null,
      nextOfKin: member.nextOfKin
        ? (member.nextOfKin as unknown as Record<string, unknown>)
        : null,
      guarantor: member.guarantor
        ? (member.guarantor as unknown as Record<string, unknown>)
        : null,
      passportPhotoId: member.passportPhotoId,
      signatureId: member.signatureId,
    };
  }

  // --- Registration --------------------------------------------------------

  async create(
    actor: ActorContext,
    input: CreateApplicationInput,
  ): Promise<ApplicationSummary> {
    const organisation = await this.loadOrganisation(input.assignment.organisationId);
    await this.require(actor.userId, CREATE, organisation.path);

    if (!organisation.isActive) {
      throw new ConflictException(
        'That organisation is inactive and cannot accept new members.',
      );
    }
    // A member belongs to a unit. Registering into a zone would leave the member
    // outside every unit-scoped officer's view.
    if (organisation.level !== 'UNIT') {
      throw new ConflictException(
        'A member is registered into a unit, not into a ' +
          `${organisation.level.toLowerCase()}.`,
      );
    }

    await this.assertLgaAvailable(input.applicant.residentialLgaId);
    await this.assertLgaAvailable(input.nextOfKin.lgaId);
    await this.assertDesignationExists(input.assignment.designationId);

    const created = await this.prisma.$transaction(async (tx) => {
      const member = await tx.member.create({
        data: {
          // No membership number yet: allocated on approval, because somebody
          // whose application is refused was never a member.
          status: 'PENDING',
          surname: input.applicant.surname,
          firstName: input.applicant.firstName,
          middleName: this.blankToNull(input.applicant.middleName),
          organisationId: organisation.id,
          designationId: input.assignment.designationId ?? null,
          contact: { create: this.contactData(input.applicant) },
          nextOfKin: { create: this.nextOfKinData(input.nextOfKin) },
          guarantor: { create: this.guarantorData(input.guarantor) },
        },
      });

      const application = await tx.membershipApplication.create({
        data: {
          applicationNumber: await this.allocateApplicationNumber(tx),
          status: 'DRAFT',
          memberId: member.id,
          // So that "did one person record this and then approve it" is a
          // question the database can answer.
          createdByUserId: actor.userId,
        },
        select: this.summarySelect(),
      });

      await this.audit.record(
        {
          action: 'application.create',
          subjectType: 'membership_application',
          subjectId: application.id,
          organisationId: organisation.id,
          actorUserId: actor.userId,
          // Names and status only. The audit trail records what changed, not a
          // shadow copy of every applicant's next-of-kin details, which it would
          // then retain for seven years (PRD §22).
          after: {
            applicationNumber: application.applicationNumber,
            status: 'DRAFT',
            memberId: member.id,
            surname: member.surname,
            firstName: member.firstName,
          },
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return application;
    });

    return this.toSummary(created);
  }

  async update(
    actor: ActorContext,
    id: string,
    input: UpdateApplicationInput,
  ): Promise<ApplicationSummary> {
    const application = await this.loadVisible(actor.userId, id);
    const member = await this.loadMemberWithPath(application.memberId);
    await this.require(actor.userId, CREATE, member.organisation.path);

    if (!isApplicationEditable(application.status as ApplicationStatus)) {
      // Editing a submitted application changes what the reviewer is judging
      // underneath them, so the decision in the audit trail would refer to
      // something other than what was decided upon.
      throw new ConflictException(
        `An application in ${application.status} can no longer be amended.`,
      );
    }

    if (input.assignment) {
      const destination = await this.loadOrganisation(
        input.assignment.organisationId,
      );
      // Moving an applicant into another unit needs the permission there too,
      // for the same reason moving an organisation does.
      await this.require(actor.userId, CREATE, destination.path);
      await this.assertDesignationExists(input.assignment.designationId);
    }
    if (input.applicant) {
      await this.assertLgaAvailable(input.applicant.residentialLgaId);
    }
    if (input.nextOfKin) {
      await this.assertLgaAvailable(input.nextOfKin.lgaId);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.applicant) {
        await tx.member.update({
          where: { id: member.id },
          data: {
            surname: input.applicant.surname,
            firstName: input.applicant.firstName,
            middleName: this.blankToNull(input.applicant.middleName),
            contact: { update: this.contactData(input.applicant) },
          },
        });
      }
      if (input.assignment) {
        await tx.member.update({
          where: { id: member.id },
          data: {
            organisationId: input.assignment.organisationId,
            designationId: input.assignment.designationId ?? null,
          },
        });
      }
      if (input.nextOfKin) {
        await tx.nextOfKin.update({
          where: { memberId: member.id },
          data: this.nextOfKinData(input.nextOfKin),
        });
      }
      if (input.guarantor) {
        await tx.guarantor.update({
          where: { memberId: member.id },
          data: this.guarantorData(input.guarantor),
        });
      }

      await this.audit.record(
        {
          action: 'application.update',
          subjectType: 'membership_application',
          subjectId: id,
          organisationId: member.organisationId,
          actorUserId: actor.userId,
          after: { sectionsAmended: Object.keys(input) },
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return tx.membershipApplication.findUniqueOrThrow({
        where: { id },
        select: this.summarySelect(),
      });
    });

    return this.toSummary(updated);
  }

  /** Attaches an already-uploaded photograph or signature to the applicant. */
  async attachMedia(
    actor: ActorContext,
    id: string,
    input: AttachMediaInput,
  ): Promise<ApplicationSummary> {
    const application = await this.loadVisible(actor.userId, id);
    const member = await this.loadMemberWithPath(application.memberId);
    await this.require(actor.userId, CREATE, member.organisation.path);

    if (!isApplicationEditable(application.status as ApplicationStatus)) {
      throw new ConflictException(
        `An application in ${application.status} can no longer be amended.`,
      );
    }

    // An asset uploaded as a signature must not become a passport photograph:
    // the card composites them differently and the kinds carry different
    // retention expectations.
    if (input.passportPhotoId) {
      await this.media.assertKind(input.passportPhotoId, 'PASSPORT_PHOTOGRAPH');
    }
    if (input.signatureId) {
      await this.media.assertKind(input.signatureId, 'MEMBER_SIGNATURE');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.member.update({
        where: { id: member.id },
        data: {
          ...(input.passportPhotoId !== undefined
            ? { passportPhotoId: input.passportPhotoId }
            : {}),
          ...(input.signatureId !== undefined
            ? { signatureId: input.signatureId }
            : {}),
        },
      });

      await this.audit.record(
        {
          action: 'application.attach_media',
          subjectType: 'membership_application',
          subjectId: id,
          organisationId: member.organisationId,
          actorUserId: actor.userId,
          after: {
            passportPhotoId: input.passportPhotoId ?? null,
            signatureId: input.signatureId ?? null,
          },
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return tx.membershipApplication.findUniqueOrThrow({
        where: { id },
        select: this.summarySelect(),
      });
    });

    return this.toSummary(updated);
  }

  // --- Workflow ------------------------------------------------------------

  async submit(actor: ActorContext, id: string): Promise<ApplicationSummary> {
    return this.transition(actor, id, 'SUBMITTED', CREATE, {
      action: 'application.submit',
      apply: (data) => ({ ...data, submittedAt: new Date() }),
    });
  }

  async withdraw(
    actor: ActorContext,
    id: string,
    input: WithdrawApplicationInput,
  ): Promise<ApplicationSummary> {
    return this.transition(actor, id, 'WITHDRAWN', CREATE, {
      action: 'application.withdraw',
      reason: input.reason,
    });
  }

  /**
   * Approve or refuse an application.
   *
   * Approval is the **only** route from `PENDING` to `ACTIVE`, and the only place
   * a membership number is allocated. Both happen in the same transaction as the
   * decision, so a member can never exist in `ACTIVE` without a number, nor hold
   * a number without an approval recorded against it.
   */
  async review(
    actor: ActorContext,
    id: string,
    input: ReviewApplicationInput,
  ): Promise<ApplicationSummary> {
    const application = await this.loadVisible(actor.userId, id);
    const member = await this.loadMemberWithPath(application.memberId);
    await this.require(actor.userId, DECIDE, member.organisation.path);

    this.assertApplication(
      application.status as ApplicationStatus,
      input.decision,
    );
    await this.assertSeparateOfficer(
      actor.userId,
      application.createdByUserId,
      'application',
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      let membershipNumber: string | null = null;

      if (input.decision === 'APPROVED') {
        assertMemberTransition(member.status as MemberStatus, 'ACTIVE');
        membershipNumber = await this.allocateMembershipNumber(tx);
        await tx.member.update({
          where: { id: member.id },
          data: { status: 'ACTIVE', membershipNumber },
        });
      }

      const row = await tx.membershipApplication.update({
        where: { id },
        data: {
          status: input.decision,
          reviewedByUserId: actor.userId,
          reviewedAt: new Date(),
          rejectionReason:
            input.decision === 'REJECTED' ? (input.reason ?? null) : null,
        },
        select: this.summarySelect(),
      });

      await this.audit.record(
        {
          action:
            input.decision === 'APPROVED'
              ? 'application.approve'
              : 'application.reject',
          subjectType: 'membership_application',
          subjectId: id,
          organisationId: member.organisationId,
          actorUserId: actor.userId,
          reason: input.reason ?? null,
          before: { status: application.status, memberStatus: member.status },
          after: {
            status: input.decision,
            memberStatus: input.decision === 'APPROVED' ? 'ACTIVE' : member.status,
            membershipNumber,
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

  /** Suspend, restore, or cancel a member after approval. */
  async setMemberStatus(
    actor: ActorContext,
    memberId: string,
    input: SetMemberStatusInput,
  ): Promise<{ id: string; status: string }> {
    const member = await this.loadMemberWithPath(memberId);
    if (!(await this.permissions.can(actor.userId, MEMBER_READ, member.organisation.path))) {
      throw new NotFoundException();
    }
    await this.require(actor.userId, MEMBER_SUSPEND, member.organisation.path);

    try {
      assertMemberTransition(member.status as MemberStatus, input.status);
    } catch (error) {
      if (error instanceof InvalidStatusTransitionError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.member.update({
        where: { id: memberId },
        data: { status: input.status },
        select: { id: true, status: true },
      });

      await this.audit.record(
        {
          action: `member.${input.status.toLowerCase()}`,
          subjectType: 'member',
          subjectId: memberId,
          organisationId: member.organisationId,
          actorUserId: actor.userId,
          reason: input.reason,
          before: { status: member.status },
          after: { status: input.status },
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return row;
    });

    return updated;
  }

  // --- The print-ready form (PRD §23.16) -----------------------------------

  /**
   * The registration form, filled in, for wet signature.
   *
   * The other half of the hybrid at PRD §23.16: data captured digitally, and a
   * printed form produced where the Union's process requires a physical
   * signature. Item 05 built the capture and deferred this to item 06, which
   * brings the PDF pipeline.
   *
   * **Requires `member_sensitive.read` on top of `application.read`.** The
   * document carries next of kin, guarantor, telephone, and residential address
   * — that is what the form is — so it is gated by the permission that governs
   * those fields rather than by the one that lists applications. An officer who
   * can see that an application exists is not thereby entitled to print
   * everything on it.
   */
  async registrationForm(
    userId: string,
    id: string,
  ): Promise<{ bytes: Uint8Array; filename: string }> {
    const application = await this.loadVisible(userId, id);
    const member = await this.loadMemberWithPath(application.memberId);
    await this.require(userId, SENSITIVE_READ, member.organisation.path);

    const detail = await this.findOne(userId, id);
    const contact = detail.contact;
    const kin = detail.nextOfKin ?? {};
    const guarantor = detail.guarantor ?? {};

    const str = (source: Record<string, unknown>, key: string): string | null => {
      const value = source[key];
      return typeof value === 'string' && value.trim().length > 0 ? value : null;
    };

    const fullName = [
      detail.member.firstName,
      detail.member.middleName,
      detail.member.surname,
    ]
      .filter((part): part is string => Boolean(part?.trim()))
      .join(' ');

    const sections: FormSection[] = [
      {
        title: 'Section A — Personal',
        fields: [
          { label: 'Name of operator', value: fullName },
          { label: 'Telephone', value: contact?.phone ?? null, half: true },
          {
            label: 'State of origin',
            value: contact?.stateOfOrigin ?? null,
            half: true,
          },
          { label: 'Residential address', value: contact?.residentialAddress ?? null },
          { label: 'Area', value: contact?.area ?? null, half: true },
          { label: 'Town / City', value: contact?.townCity ?? null, half: true },
          {
            label: 'Local government area',
            value: contact?.lga?.name ?? null,
            half: true,
          },
          {
            label: 'Designation',
            // Blank until ORG-06 arrives.
            value: detail.member.designation?.label ?? null,
            half: true,
          },
        ],
      },
      {
        title: 'Section B — Union placement',
        fields: [
          {
            label: 'Unit / Unity Body',
            value: detail.member.organisation.name,
            half: true,
          },
          {
            label: 'Membership number',
            value: detail.member.membershipNumber,
            half: true,
          },
        ],
      },
      {
        title: 'Section C — Next of Kin',
        fields: [
          {
            label: 'Name',
            value: [str(kin, 'firstName'), str(kin, 'middleName'), str(kin, 'surname')]
              .filter((part): part is string => part !== null)
              .join(' ') || null,
          },
          { label: 'Telephone', value: str(kin, 'phone'), half: true },
          { label: 'Occupation', value: str(kin, 'occupation'), half: true },
          { label: 'Address', value: str(kin, 'address') },
        ],
      },
      {
        title: 'Section D — Guarantor',
        // MEM-08: the exact printed wording of the collateral question, and
        // whether the vehicle referred to is a tricycle, a motorcycle, or both,
        // is not legible on the photographed form. What prints here is what the
        // field specification records.
        note:
          'The guarantor undertakes responsibility for the operator named above. ' +
          'Collateral wording is subject to confirmation by the Union (MEM-08).',
        fields: [
          {
            label: 'Name',
            value:
              [
                str(guarantor, 'firstName'),
                str(guarantor, 'middleName'),
                str(guarantor, 'surname'),
              ]
                .filter((part): part is string => part !== null)
                .join(' ') || null,
          },
          {
            label: 'Relationship with operator',
            value: str(guarantor, 'relationshipToApplicant'),
            half: true,
          },
          { label: 'Telephone', value: str(guarantor, 'phone'), half: true },
          { label: 'Address', value: str(guarantor, 'address') },
          {
            label: 'Occupation',
            value: str(guarantor, 'occupation'),
            half: true,
          },
          {
            label: 'Collateral offered',
            value:
              guarantor['hasCollateral'] === true
                ? 'Yes'
                : guarantor['hasCollateral'] === false
                  ? 'No'
                  : null,
            half: true,
          },
          {
            label: 'Collateral details',
            value: str(guarantor, 'collateralDetails'),
          },
        ],
      },
    ];

    const bytes = await renderRegistrationForm({
      applicationNumber: detail.applicationNumber,
      membershipNumber: detail.member.membershipNumber,
      status: detail.status,
      sections,
      // MEM-09 — the printed labels beneath the signature lines are not legible
      // on the photographed form and are believed to be dates. A date line is
      // printed beneath each signature until the Union confirms.
      signatureLines: [
        'Signature of operator',
        'Signature of next of kin',
        'Signature of guarantor',
      ],
    });

    // Named by application number, which conveys nothing about the applicant.
    return {
      bytes,
      filename: `nurtw-registration-${detail.applicationNumber}.pdf`,
    };
  }

  // --- Internals -----------------------------------------------------------

  private async transition(
    actor: ActorContext,
    id: string,
    to: ApplicationStatus,
    permission: string,
    options: {
      action: string;
      reason?: string;
      apply?: (data: Prisma.MembershipApplicationUpdateInput) => Prisma.MembershipApplicationUpdateInput;
    },
  ): Promise<ApplicationSummary> {
    const application = await this.loadVisible(actor.userId, id);
    const member = await this.loadMemberWithPath(application.memberId);
    await this.require(actor.userId, permission, member.organisation.path);

    this.assertApplication(application.status as ApplicationStatus, to);

    const base: Prisma.MembershipApplicationUpdateInput = { status: to };
    const data = options.apply ? options.apply(base) : base;

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.membershipApplication.update({
        where: { id },
        data,
        select: this.summarySelect(),
      });

      await this.audit.record(
        {
          action: options.action,
          subjectType: 'membership_application',
          subjectId: id,
          organisationId: member.organisationId,
          actorUserId: actor.userId,
          reason: options.reason ?? null,
          before: { status: application.status },
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

  /**
   * Refuses a decision by the officer who recorded the work, when the Union has
   * asked for a second pair of eyes.
   *
   * `member.create` and `application.decide` are separate permissions, but that
   * separates the *permissions*, not the *people*: one user holding both may do
   * both, and the super administrator holds both by definition. This is the
   * control that separates the people, and it is **off by default** pending
   * QUESTIONS.md MEM-04 — with one administrator account, enforcing it makes a
   * registration impossible to complete.
   *
   * An unknown recorder allows the decision. The System cannot prove the same
   * person is acting twice, and refusing on a suspicion would strand every
   * application created before the column existed whose audit event has since
   * been purged.
   */
  private async assertSeparateOfficer(
    actorUserId: string,
    recordedByUserId: string | null,
    noun: string,
  ): Promise<void> {
    if (!recordedByUserId || recordedByUserId !== actorUserId) {
      return;
    }
    if (!(await this.settings.isEnabled(REQUIRE_SEPARATE_OFFICER))) {
      return;
    }
    throw new ConflictException(
      `The officer who recorded this ${noun} may not decide it. ` +
        'A second officer must act.',
    );
  }

  private assertApplication(from: ApplicationStatus, to: ApplicationStatus): void {
    try {
      assertApplicationTransition(from, to);
    } catch (error) {
      if (error instanceof InvalidStatusTransitionError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
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
   * Loads an application the caller may read, or 404.
   *
   * "Outside your scope" and "no such application" answer identically, so an
   * officer cannot establish which identifiers name real applicants.
   */
  private async loadVisible(userId: string, id: string) {
    const application = await this.prisma.membershipApplication.findUnique({
      where: { id },
      include: { member: { include: { organisation: { select: { path: true } } } } },
    });
    if (!application?.member) {
      throw new NotFoundException();
    }
    const allowed = await this.permissions.can(
      userId,
      READ,
      application.member.organisation.path,
    );
    if (!allowed) {
      throw new NotFoundException();
    }
    return { ...application, memberId: application.member.id };
  }

  private async loadMemberWithPath(memberId: string) {
    return this.prisma.member.findUniqueOrThrow({
      where: { id: memberId },
      include: { organisation: { select: { path: true, id: true } } },
    });
  }

  private async loadOrganisation(id: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { id },
    });
    if (!organisation) {
      throw new NotFoundException();
    }
    return organisation;
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
   * Validates a local government area reference.
   *
   * **On PRD Requirement 7.2.** That requirement says a local government area
   * must be validated as belonging to the selected state *where both are
   * captured as structured values*. Here they are not: the only structured state
   * on the record is the one the LGA itself carries, so the pair cannot
   * disagree — the requirement is satisfied by construction rather than by a
   * check.
   *
   * `state_of_origin` is deliberately **not** that state. It is where the member
   * is *from*; the LGA is where they *live*. An Anambra resident originating
   * from Enugu is ordinary, and validating one against the other would reject
   * correct data. PRD §23.2 keeps the same two ideas apart on the card.
   *
   * If the Union later captures a separate residential state, that is the point
   * at which a cross-check becomes both possible and required.
   */
  private async assertLgaAvailable(lgaId: string | undefined): Promise<void> {
    if (!lgaId) {
      return;
    }
    const lga = await this.prisma.lga.findUnique({
      where: { id: lgaId },
      select: { isActive: true },
    });
    if (!lga?.isActive) {
      throw new ConflictException(
        'That local government area is not available.',
      );
    }
  }

  private async assertDesignationExists(id: string | undefined): Promise<void> {
    if (!id) {
      return;
    }
    const designation = await this.prisma.designation.findUnique({
      where: { id },
    });
    if (!designation?.isActive) {
      throw new ConflictException('That designation is not available.');
    }
  }

  /**
   * A membership number, retried on the vanishingly unlikely collision.
   *
   * 31^12 possibilities against a register of thousands, so a collision is
   * essentially impossible — but "essentially impossible" and "handled" differ
   * by one failed registration at a counter with a member waiting.
   */
  private async allocateMembershipNumber(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    for (let attempt = 0; attempt < IDENTIFIER_ATTEMPTS; attempt++) {
      const candidate = generateIdentifier(() => randomInt(256));
      const clash = await tx.member.findUnique({
        where: { membershipNumber: candidate },
        select: { id: true },
      });
      if (!clash) {
        return candidate;
      }
    }
    throw new ConflictException(
      'Could not allocate a membership number. Please try again.',
    );
  }

  private async allocateApplicationNumber(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    for (let attempt = 0; attempt < IDENTIFIER_ATTEMPTS; attempt++) {
      const candidate = generateIdentifier(() => randomInt(256));
      const clash = await tx.membershipApplication.findUnique({
        where: { applicationNumber: candidate },
        select: { id: true },
      });
      if (!clash) {
        return candidate;
      }
    }
    throw new ConflictException('Could not allocate an application number.');
  }

  private blankToNull(value: string | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : null;
  }

  private contactData(applicant: CreateApplicationInput['applicant']) {
    return {
      phone: applicant.phone,
      residentialAddress: applicant.residentialAddress,
      area: this.blankToNull(applicant.area),
      townCity: this.blankToNull(applicant.townCity),
      residentialLgaId: applicant.residentialLgaId ?? null,
      stateOfOrigin: this.blankToNull(applicant.stateOfOrigin),
    };
  }

  private nextOfKinData(nextOfKin: CreateApplicationInput['nextOfKin']) {
    return {
      surname: nextOfKin.surname,
      firstName: nextOfKin.firstName,
      middleName: this.blankToNull(nextOfKin.middleName),
      address: nextOfKin.address,
      area: this.blankToNull(nextOfKin.area),
      townCity: this.blankToNull(nextOfKin.townCity),
      lgaId: nextOfKin.lgaId ?? null,
      stateOfOrigin: this.blankToNull(nextOfKin.stateOfOrigin),
      phone: nextOfKin.phone,
      occupation: this.blankToNull(nextOfKin.occupation),
      signatureDate: nextOfKin.signedOn ? new Date(nextOfKin.signedOn) : null,
    };
  }

  private guarantorData(guarantor: CreateApplicationInput['guarantor']) {
    return {
      surname: guarantor.surname,
      firstName: guarantor.firstName,
      middleName: this.blankToNull(guarantor.middleName),
      address: guarantor.address,
      area: this.blankToNull(guarantor.area),
      townCity: this.blankToNull(guarantor.townCity),
      relationshipToApplicant: guarantor.relationshipToApplicant,
      phone: guarantor.phone,
      occupation: this.blankToNull(guarantor.occupation),
      hasCollateral: guarantor.hasCollateral ?? null,
      collateralDetails: this.blankToNull(guarantor.collateralDetails),
    };
  }

  /**
   * The list projection.
   *
   * Fields named explicitly, never a spread. PRD Requirement 7.1 keeps
   * next-of-kin, guarantor, collateral, telephone, and address out of anything
   * but the registration detail view — and a list is where an over-generous
   * projection would disclose the most at once.
   */
  private summarySelect() {
    return {
      id: true,
      applicationNumber: true,
      status: true,
      submittedAt: true,
      reviewedAt: true,
      member: {
        select: {
          id: true,
          surname: true,
          firstName: true,
          middleName: true,
          status: true,
          membershipNumber: true,
          organisation: { select: { id: true, name: true, level: true } },
          designation: { select: { id: true, code: true, label: true } },
        },
      },
    } satisfies Prisma.MembershipApplicationSelect;
  }

  private toSummary(row: {
    id: string;
    applicationNumber: string;
    status: string;
    submittedAt: Date | null;
    reviewedAt: Date | null;
    member: ApplicationSummary['member'] | null;
  }): ApplicationSummary {
    if (!row.member) {
      throw new NotFoundException();
    }
    return {
      id: row.id,
      applicationNumber: row.applicationNumber,
      status: row.status,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      member: row.member,
    };
  }
}
