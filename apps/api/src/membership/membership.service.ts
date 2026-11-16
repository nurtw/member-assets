import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  ApplicationDetail,
  ApplicationSummary,
  CreateApplicationInput,
  MemberNinState,
  MemberPhotograph,
  MemberRecord,
  MemberRecordSensitive,
  MemberSearchResult,
  RegistrationGuarantor,
  RegistrationNextOfKin,
  RemoveMemberNinInput,
  SetMemberNinInput,
  SetMemberStatusInput,
  UpdateApplicationInput,
} from '@nurtw/contracts';
import {
  assertMemberTransition,
  correctionRight,
  generateIdentifier,
  InvalidStatusTransitionError,
  outermostScopes,
  type MemberStatus,
} from '@nurtw/domain';
import type { Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';

import { AuditService } from '../audit/audit.service.js';
import { PermissionService } from '../auth/permission.service.js';
import { MediaService } from '../media/media.service.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MemberIdentityService } from './member-identity.service.js';
import {
  renderRegistrationForm,
  type FormSection,
} from './registration-form.js';

const READ = 'application.read';
const CREATE = 'member.create';
const MEMBER_READ = 'member.read';
const MEMBER_SUSPEND = 'member.suspend';
const SENSITIVE_READ = 'member_sensitive.read';
const MEMBER_UPDATE = 'member.update';

/** Attempts before a membership-number collision is treated as a real fault. */
const IDENTIFIER_ATTEMPTS = 5;

/**
 * A next of kin, and a guarantor, as they are returned: the fields of
 * `RegistrationNextOfKin` and `RegistrationGuarantor`, each named.
 *
 * The first three are what the form asks for. The rest was asked for before
 * PRD revision 1.14 and is returned so that an earlier registration shows all
 * it had. The old name parts are not among them: the full name carries the
 * name. Add a column here only on purpose (Requirement 7.1).
 */
const NEXT_OF_KIN_SELECT = {
  fullName: true,
  phone: true,
  address: true,
  area: true,
  townCity: true,
  occupation: true,
  stateOfOrigin: true,
  lga: { select: { id: true, name: true, stateName: true } },
} satisfies Prisma.NextOfKinSelect;

const GUARANTOR_SELECT = {
  fullName: true,
  phone: true,
  address: true,
  area: true,
  townCity: true,
  occupation: true,
  relationshipToApplicant: true,
  hasCollateral: true,
  collateralDetails: true,
} satisfies Prisma.GuarantorSelect;

/**
 * Membership registration (PRD §7).
 *
 * **Record-scoped throughout.** Every method resolves the applicant's
 * organisation path and asks `can` against it. The guard has established only
 * that the caller holds the permission *somewhere*; without the second check an
 * officer in one branch could read, amend, and approve another branch's
 * applicants — which is the whole personal-data surface of the Union.
 *
 * Registering a member makes them active at once (item 61, `QUESTIONS.md`
 * MEM-20): there is no draft and no review. The member is a `member` row in
 * `ACTIVE` with a membership number, and `membership_application` is the
 * registration record: its number, who recorded it, when, and the registering
 * officer's one correction. See `plans/61-immediate-registration.md`.
 */
@Injectable()
export class MembershipService {
  private readonly logger = new Logger(MembershipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    private readonly identity: MemberIdentityService,
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

  /**
   * A name/membership-number lookup for pickers elsewhere in the System —
   * vehicle declaration's owner field is the first caller. Scoped by
   * `member.read`, not `application.read`: a picker only needs to find the
   * person, never their application history, and gating it on the narrower
   * permission lets a role that can read members but not applications (the
   * card administrator and the auditor, for two) use it too.
   *
   * The Members screen (item 37) reads the same list, longer and by status.
   * The projection is the same for both, and carries nothing Requirement 7.1
   * keeps apart.
   */
  async searchMembers(
    userId: string,
    filters: {
      q?: string;
      organisationId?: string;
      statuses?: readonly MemberStatus[];
      limit?: number;
    },
  ): Promise<MemberSearchResult[]> {
    const scopes = await this.readableScopes(userId, MEMBER_READ);
    if (scopes.length === 0) {
      return [];
    }

    const q = filters.q?.trim();
    const rows = await this.prisma.member.findMany({
      where: {
        AND: [
          { OR: scopes.map((path) => ({ organisation: { path: { startsWith: path } } })) },
          ...(filters.organisationId
            ? [{ organisationId: filters.organisationId }]
            : []),
          ...(filters.statuses && filters.statuses.length > 0
            ? [{ status: { in: [...filters.statuses] } }]
            : []),
          ...(q
            ? [
                {
                  OR: [
                    { surname: { contains: q, mode: 'insensitive' as const } },
                    { firstName: { contains: q, mode: 'insensitive' as const } },
                    {
                      membershipNumber: {
                        contains: q,
                        mode: 'insensitive' as const,
                      },
                    },
                  ],
                },
              ]
            : []),
        ],
      },
      select: {
        id: true,
        surname: true,
        firstName: true,
        middleName: true,
        status: true,
        membershipNumber: true,
        organisation: { select: { id: true, name: true, level: true } },
      },
      orderBy: [{ surname: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
      take: filters.limit ?? 20,
    });

    return rows;
  }

  /**
   * One member's record (item 37).
   *
   * A migrated member has no application, so the application's route cannot
   * open them; this one is keyed by the member. Scoped by `member.read` over
   * the member's own organisation, and a member outside it answers as one that
   * does not exist.
   *
   * **Built by projection, in three parts.** What a list already shows is read
   * first. The application is read only for somebody who may read applications
   * over this member. Contact, next of kin, and guarantor are read only for a
   * holder of `member_sensitive.read` over this member, which is the permission
   * that governs those fields (Requirement 7.1). The two optional parts are
   * left out of the response, never sent empty, so nothing is fetched and then
   * hidden.
   */
  async findMember(userId: string, id: string): Promise<MemberRecord> {
    const member = await this.prisma.member.findUnique({
      where: { id },
      select: {
        id: true,
        surname: true,
        firstName: true,
        middleName: true,
        status: true,
        membershipNumber: true,
        organisation: {
          select: { id: true, name: true, level: true, path: true },
        },
        designation: { select: { id: true, code: true, label: true } },
        passportPhotoId: true,
      },
    });
    if (
      !member ||
      !(await this.permissions.can(userId, MEMBER_READ, member.organisation.path))
    ) {
      throw new NotFoundException();
    }
    const path = member.organisation.path;
    // Whether a NIN is recorded goes to every reader of the member; its last
    // four digits only with the sensitive part. The NIN itself goes to nobody.
    const nin = await this.identity.state(id);

    const record: MemberRecord = {
      id: member.id,
      surname: member.surname,
      firstName: member.firstName,
      middleName: member.middleName,
      status: member.status,
      membershipNumber: member.membershipNumber,
      // The path decides scope and is never returned.
      organisation: {
        id: member.organisation.id,
        name: member.organisation.name,
        level: member.organisation.level,
      },
      designation: member.designation,
      ninRecorded: nin.ninRecorded,
      passportPhotoId: member.passportPhotoId,
      // Signed here, for one member, as on an application's detail. The link
      // lasts minutes and names one file, and no list carries one.
      passportPhotoUrl: member.passportPhotoId
        ? this.media.signUrl(member.passportPhotoId).url
        : null,
    };

    if (await this.permissions.can(userId, READ, path)) {
      record.application = await this.prisma.membershipApplication.findUnique({
        where: { memberId: id },
        select: { id: true, applicationNumber: true, status: true },
      });
    }

    if (await this.permissions.can(userId, SENSITIVE_READ, path)) {
      record.sensitive = await this.sensitiveParts(id, nin.ninLastFour);
    }

    return record;
  }

  /** Contact, next of kin, guarantor, and the NIN's last four digits, each field named. */
  private async sensitiveParts(
    memberId: string,
    ninLastFour: string | null,
  ): Promise<MemberRecordSensitive> {
    const [contact, nextOfKin, guarantor] = await Promise.all([
      this.prisma.memberContact.findUnique({
        where: { memberId },
        select: {
          phone: true,
          residentialAddress: true,
          area: true,
          townCity: true,
          stateOfOrigin: true,
          residentialLga: { select: { id: true, name: true, stateName: true } },
        },
      }),
      this.prisma.nextOfKin.findUnique({
        where: { memberId },
        select: NEXT_OF_KIN_SELECT,
      }),
      this.prisma.guarantor.findUnique({
        where: { memberId },
        select: GUARANTOR_SELECT,
      }),
    ]);

    return {
      contact: contact
        ? {
            phone: contact.phone,
            residentialAddress: contact.residentialAddress,
            area: contact.area,
            townCity: contact.townCity,
            lga: contact.residentialLga,
            stateOfOrigin: contact.stateOfOrigin,
          }
        : null,
      nextOfKin,
      guarantor,
      ninLastFour,
    };
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
        // Each field named (Requirement 7.1): no row identifier, no timestamp,
        // and nothing a later column would add by default.
        nextOfKin: { select: NEXT_OF_KIN_SELECT },
        guarantor: { select: GUARANTOR_SELECT },
      },
    });
    // Whether a NIN is recorded, and its last four digits. Never the NIN.
    const nin = await this.identity.state(member.id);

    return {
      id: application.id,
      applicationNumber: application.applicationNumber,
      status: application.status,
      registeredAt: application.createdAt.toISOString(),
      registeredBy: application.createdByUser?.fullName ?? null,
      correction: correctionRight({
        administrator: await this.permissions.can(
          userId,
          MEMBER_UPDATE,
          // `loadVisible` has already refused an application with no member.
          application.member!.organisation.path,
        ),
        registeredByCaller: application.createdByUserId === userId,
        correctionUsed: application.correctedAt !== null,
      }),
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
      nextOfKin: member.nextOfKin,
      guarantor: member.guarantor,
      passportPhotoId: member.passportPhotoId,
      // Signed here, for a reader who has just been shown the rest of the
      // record. The link lasts minutes and names one file.
      passportPhotoUrl: member.passportPhotoId
        ? this.media.signUrl(member.passportPhotoId).url
        : null,
      signatureId: member.signatureId,
      ninRecorded: nin.ninRecorded,
      ninLastFour: nin.ninLastFour,
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
    await this.assertDesignationExists(input.assignment.designationId);
    if (input.applicant.nin) {
      // Before anything is written: without the key nothing is saved, rather
      // than everything but the NIN.
      this.identity.assertAvailable();
    }
    // An asset uploaded as a signature must not become a passport photograph:
    // the card composites them differently.
    if (input.passportPhotoId) {
      await this.media.assertKind(input.passportPhotoId, 'PASSPORT_PHOTOGRAPH');
    }
    if (input.signatureId) {
      await this.media.assertKind(input.signatureId, 'MEMBER_SIGNATURE');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      // Item 61 (MEM-20): the member is active the moment the registration is
      // saved, with a number. Both are written in this transaction, so a member
      // can never be active without a number, or hold one without a record.
      const membershipNumber = await this.allocateMembershipNumber(tx);
      const registeredAt = new Date();
      const member = await tx.member.create({
        data: {
          status: 'ACTIVE',
          membershipNumber,
          ...(input.passportPhotoId ? { passportPhotoId: input.passportPhotoId } : {}),
          ...(input.signatureId ? { signatureId: input.signatureId } : {}),
          surname: input.applicant.surname,
          firstName: input.applicant.firstName,
          middleName: this.blankToNull(input.applicant.middleName),
          organisationId: organisation.id,
          designationId: input.assignment.designationId ?? null,
          contact: { create: this.contactData(input.applicant) },
          nextOfKin: { create: this.nextOfKinData(input.nextOfKin) },
          // MEM-06: a guarantor is not compulsory.
          guarantor: input.guarantor
            ? { create: this.guarantorData(input.guarantor) }
            : undefined,
        },
      });
      if (input.applicant.nin) {
        await this.identity.record(tx, member.id, input.applicant.nin);
      }

      const application = await tx.membershipApplication.create({
        data: {
          applicationNumber: await this.allocateApplicationNumber(tx),
          status: 'APPROVED',
          memberId: member.id,
          // Who registered the member: the only record of it, since nobody
          // reviews a registration, and the one person with a single correction.
          createdByUserId: actor.userId,
          reviewedByUserId: actor.userId,
          // The membership fee is owed from here (`DuesService`).
          reviewedAt: registeredAt,
        },
        select: this.summarySelect(),
      });

      await this.audit.record(
        {
          action: 'member.register',
          subjectType: 'membership_application',
          subjectId: application.id,
          organisationId: organisation.id,
          actorUserId: actor.userId,
          // Names and status only. The audit trail records what changed, not a
          // shadow copy of every applicant's next-of-kin details, which it would
          // then retain for seven years (PRD §22).
          after: {
            applicationNumber: application.applicationNumber,
            status: 'APPROVED',
            memberStatus: 'ACTIVE',
            membershipNumber,
            memberId: member.id,
            surname: member.surname,
            firstName: member.firstName,
            // That a NIN was given, never which (Requirement 7.4).
            ninRecorded: Boolean(input.applicant.nin),
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

  /**
   * The registering officer's one correction (item 61, `QUESTIONS.md` MEM-20).
   *
   * An administrator may correct at any time, from the member's page
   * (`amendRegistration`). The officer who registered the member has **one**
   * correction, claimed by a conditional `updateMany` so two cannot race; nobody
   * else has any. A cancelled membership is final and is not corrected.
   */
  async update(
    actor: ActorContext,
    id: string,
    input: UpdateApplicationInput,
  ): Promise<ApplicationSummary> {
    const application = await this.loadVisible(actor.userId, id);
    const member = await this.loadMemberWithPath(application.memberId);
    await this.require(actor.userId, CREATE, member.organisation.path);

    const right = correctionRight({
      administrator: await this.permissions.can(
        actor.userId,
        MEMBER_UPDATE,
        member.organisation.path,
      ),
      registeredByCaller: application.createdByUserId === actor.userId,
      correctionUsed: application.correctedAt !== null,
    });
    if (right === 'NONE' || member.status === 'CANCELLED') {
      throw new ConflictException(
        'This registration can no longer be corrected by you.',
      );
    }

    return this.correct(actor, {
      applicationId: id,
      member,
      input,
      destinationPermission: CREATE,
      claimOnce: right === 'ONCE',
    });
  }

  /**
   * An administrator's correction of a member's registration, at any time
   * (`PATCH /members/:id/registration`, `member.update`). Not counted: the one
   * correction belongs to the officer who registered the member.
   */
  async amendRegistration(
    actor: ActorContext,
    memberId: string,
    input: UpdateApplicationInput,
  ): Promise<ApplicationSummary> {
    const changing = await this.loadForChange(actor.userId, memberId);
    const application = await this.prisma.membershipApplication.findUnique({
      where: { memberId },
      select: { id: true },
    });
    if (!application) {
      throw new ConflictException('This member has no registration to correct.');
    }
    const member = await this.loadMemberWithPath(changing.id);
    return this.correct(actor, {
      applicationId: application.id,
      member,
      input,
      destinationPermission: MEMBER_UPDATE,
      claimOnce: false,
    });
  }

  /** The correction itself, once the caller's right to make it is settled. */
  private async correct(
    actor: ActorContext,
    options: {
      applicationId: string;
      member: {
        id: string;
        organisationId: string;
        status: string;
        organisation: { path: string; id: string };
      };
      input: UpdateApplicationInput;
      destinationPermission: string;
      claimOnce: boolean;
    },
  ): Promise<ApplicationSummary> {
    const { applicationId: id, member, input } = options;

    if (input.assignment) {
      const destination = await this.loadOrganisation(
        input.assignment.organisationId,
      );
      // Moving a member into another unit needs the permission there too, for
      // the same reason moving an organisation does.
      await this.require(actor.userId, options.destinationPermission, destination.path);
      await this.assertDesignationExists(input.assignment.designationId);
    }
    if (input.applicant) {
      await this.assertLgaAvailable(input.applicant.residentialLgaId);
      if (input.applicant.nin) {
        this.identity.assertAvailable();
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (options.claimOnce) {
        const claimed = await tx.membershipApplication.updateMany({
          where: { id, correctedAt: null, createdByUserId: actor.userId },
          data: { correctedAt: new Date() },
        });
        if (claimed.count === 0) {
          throw new ConflictException(
            'This registration can no longer be corrected by you.',
          );
        }
      }

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
        // Given, it replaces the NIN recorded; left out, that one stays. A NIN
        // is never read back to be sent again, so an amendment never blanks one.
        if (input.applicant.nin) {
          await this.identity.record(tx, member.id, input.applicant.nin);
        }
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
        // Guarantor is optional at creation (MEM-06), so this section may not
        // have a row yet — upsert rather than update.
        await tx.guarantor.upsert({
          where: { memberId: member.id },
          create: { memberId: member.id, ...this.guarantorData(input.guarantor) },
          update: this.guarantorData(input.guarantor),
        });
      }

      await this.audit.record(
        {
          action: 'member.correct',
          subjectType: 'membership_application',
          subjectId: id,
          organisationId: member.organisationId,
          actorUserId: actor.userId,
          after: {
            // The sections, never their values (Requirement 7.1).
            sectionsAmended: Object.keys(input),
            usedOneCorrection: options.claimOnce,
            // That a NIN was given, never which (Requirement 7.4).
            ninRecorded: Boolean(input.applicant?.nin),
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

  /** Suspend, restore, or cancel a member after approval. */
  async setMemberStatus(
    actor: ActorContext,
    memberId: string,
    input: SetMemberStatusInput,
  ): Promise<{ id: string; status: string }> {
    // A member who does not exist and one outside the caller's scope answer
    // alike. `findUniqueOrThrow` here answered an unknown id with a 500.
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      include: { organisation: { select: { path: true, id: true } } },
    });
    if (
      !member ||
      !(await this.permissions.can(actor.userId, MEMBER_READ, member.organisation.path))
    ) {
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
      if (input.status === 'CANCELLED') {
        // Somebody who rejoins is registered again, with the same NIN. The
        // cancelled record keeps its own (item 44).
        await this.identity.release(tx, memberId, new Date());
      }

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

  // --- The member's NIN and photograph (item 44) ---------------------------

  /**
   * Records a member's NIN, or replaces it (item 44; PRD Requirement 7.4).
   *
   * For any member but a cancelled one: an approved or migrated member has no
   * draft to amend, which is the other way a NIN is given. Needs
   * `member.update` over the member. The audit trail records that it changed,
   * never what it became.
   */
  async setNin(
    actor: ActorContext,
    memberId: string,
    input: SetMemberNinInput,
  ): Promise<MemberNinState> {
    const member = await this.loadForChange(actor.userId, memberId);
    this.identity.assertAvailable();

    await this.prisma.$transaction(async (tx) => {
      const { replaced } = await this.identity.record(tx, memberId, input.nin);
      await this.audit.record(
        {
          action: 'member.nin.record',
          subjectType: 'member',
          subjectId: memberId,
          organisationId: member.organisationId,
          actorUserId: actor.userId,
          before: { ninRecorded: replaced },
          after: { ninRecorded: true },
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );
    });

    return this.identity.state(memberId);
  }

  /**
   * Takes a member's NIN off their record, with a reason: for one recorded
   * against the wrong member, which would otherwise keep it from its owner.
   */
  async removeNin(
    actor: ActorContext,
    memberId: string,
    input: RemoveMemberNinInput,
  ): Promise<MemberNinState> {
    const member = await this.loadForChange(actor.userId, memberId);

    await this.prisma.$transaction(async (tx) => {
      if (!(await this.identity.remove(tx, memberId))) {
        throw new ConflictException('No NIN is recorded for this member.');
      }
      await this.audit.record(
        {
          action: 'member.nin.remove',
          subjectType: 'member',
          subjectId: memberId,
          organisationId: member.organisationId,
          actorUserId: actor.userId,
          reason: input.reason,
          before: { ninRecorded: true },
          after: { ninRecorded: false },
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );
    });

    return { ninRecorded: false, ninLastFour: null };
  }

  /**
   * Adds or replaces a member's photograph on their record (item 44): an
   * approved or migrated member included, whose application, if any, can no
   * longer be amended.
   *
   * The file comes with the request, so an officer who may change a member
   * but not register one needs no upload permission of the registration's.
   * A card keeps the photograph it printed (`printedPhotoId`); the one this
   * replaces is discarded unless a card holds it.
   */
  async setPhotograph(
    actor: ActorContext,
    memberId: string,
    bytes: Buffer,
  ): Promise<MemberPhotograph> {
    const member = await this.loadForChange(actor.userId, memberId);
    // The bytes decide what the file is, as for every upload.
    const stored = await this.media.upload(bytes, 'PASSPORT_PHOTOGRAPH');
    const previous = member.passportPhotoId;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.member.update({
          where: { id: memberId },
          data: { passportPhotoId: stored.id },
        });
        await this.audit.record(
          {
            action: 'member.photograph.set',
            subjectType: 'member',
            subjectId: memberId,
            organisationId: member.organisationId,
            actorUserId: actor.userId,
            before: { passportPhotoId: previous },
            after: { passportPhotoId: stored.id },
            requestId: actor.requestId,
            ipAddress: actor.ipAddress,
          },
          tx,
        );
      });
    } catch (error) {
      // Not attached, so nothing holds the new file.
      await this.discardReplaced(stored.id);
      throw error;
    }

    if (previous) {
      await this.discardReplaced(previous);
    }

    return {
      passportPhotoId: stored.id,
      passportPhotoUrl: this.media.signUrl(stored.id).url,
    };
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
    const kin: RegistrationNextOfKin | null = detail.nextOfKin;
    const guarantor: RegistrationGuarantor | null = detail.guarantor;

    /**
     * A line for something the form no longer asks for (PRD revision 1.14),
     * printed only where an earlier registration recorded it. A form made
     * today has no blank line for a question nobody is asked.
     */
    const earlier = (
      label: string,
      value: string | null | undefined,
    ): { label: string; value: string; half: boolean }[] =>
      value && value.trim().length > 0 ? [{ label, value, half: true }] : [];

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
        // MEM-16: a full name and a telephone number; an address if given.
        title: 'Section C — Next of Kin',
        fields: [
          { label: 'Full name', value: kin?.fullName ?? null },
          { label: 'Telephone', value: kin?.phone ?? null, half: true },
          ...earlier('Occupation', kin?.occupation),
          { label: 'Address', value: kin?.address ?? null },
          ...earlier('Town / City', kin?.townCity),
          ...earlier('Local government area', kin?.lga?.name),
          ...earlier('State of origin', kin?.stateOfOrigin),
        ],
      },
      {
        // MEM-06: a full name, a telephone number, and an address. A guarantor
        // is not compulsory, so the section may print empty.
        title: 'Section D — Guarantor',
        note: 'The guarantor undertakes responsibility for the operator named above.',
        fields: [
          { label: 'Full name', value: guarantor?.fullName ?? null },
          { label: 'Telephone', value: guarantor?.phone ?? null, half: true },
          ...earlier(
            'Relationship with operator',
            guarantor?.relationshipToApplicant,
          ),
          { label: 'Address', value: guarantor?.address ?? null },
          ...earlier('Town / City', guarantor?.townCity),
          ...earlier('Occupation', guarantor?.occupation),
          ...earlier(
            'Collateral offered',
            guarantor?.hasCollateral === true
              ? 'Yes'
              : guarantor?.hasCollateral === false
                ? 'No'
                : null,
          ),
          ...earlier('Collateral details', guarantor?.collateralDetails),
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

  private async readableScopes(
    userId: string,
    permission: string = READ,
  ): Promise<string[]> {
    const held = await this.permissions.listFor(userId);
    return outermostScopes(
      held
        .filter((entry) => entry.permission === permission)
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
      include: {
        member: { include: { organisation: { select: { path: true } } } },
        createdByUser: { select: { fullName: true } },
      },
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

  /**
   * A member about to be changed on their record (item 44). 404 alike for one
   * that does not exist and one the caller may not read; 403 without
   * `member.update` over them; 409 once the membership is cancelled, which is
   * final, and whose NIN is released for a new registration.
   */
  private async loadForChange(userId: string, memberId: string) {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        status: true,
        organisationId: true,
        passportPhotoId: true,
        organisation: { select: { path: true } },
      },
    });
    if (
      !member ||
      !(await this.permissions.can(userId, MEMBER_READ, member.organisation.path))
    ) {
      throw new NotFoundException();
    }
    await this.require(userId, MEMBER_UPDATE, member.organisation.path);
    if (member.status === 'CANCELLED') {
      throw new ConflictException('A cancelled membership is not changed.');
    }
    return member;
  }

  /**
   * Discards a photograph that is no longer attached. `MediaService.discard`
   * refuses one a card printed, which is history and stays: that refusal is
   * expected, and anything else is only logged, because the change is made.
   */
  private async discardReplaced(assetId: string): Promise<void> {
    try {
      await this.media.discard(assetId);
    } catch (error) {
      if (!(error instanceof BadRequestException)) {
        this.logger.warn(`Photograph ${assetId} was not discarded: ${String(error)}`);
      }
    }
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
      // The form no longer asks for an area (MEM-17). It is written only when
      // one is sent, so amending a draft never blanks one recorded earlier.
      ...(applicant.area !== undefined
        ? { area: this.blankToNull(applicant.area) }
        : {}),
      townCity: this.blankToNull(applicant.townCity),
      residentialLgaId: applicant.residentialLgaId ?? null,
      stateOfOrigin: this.blankToNull(applicant.stateOfOrigin),
    };
  }

  /**
   * What the form now gives for a next of kin (PRD revision 1.14).
   *
   * **Only these columns are written.** The town, local government area, state
   * of origin, and occupation are no longer asked for, and are deliberately
   * absent here: on an amendment they keep whatever an earlier form recorded.
   * The three name parts are the exception. They are cleared, because the full
   * name just entered replaces them, and a stale surname beside it would be a
   * second, contradicting name.
   */
  private nextOfKinData(nextOfKin: CreateApplicationInput['nextOfKin']) {
    return {
      fullName: nextOfKin.fullName,
      surname: null,
      firstName: null,
      middleName: null,
      phone: nextOfKin.phone,
      address: this.blankToNull(nextOfKin.address),
      signatureDate: nextOfKin.signedOn ? new Date(nextOfKin.signedOn) : null,
    };
  }

  /** As `nextOfKinData`: the relationship, occupation, town, and collateral are left as they are. */
  private guarantorData(guarantor: NonNullable<CreateApplicationInput['guarantor']>) {
    return {
      fullName: guarantor.fullName,
      surname: null,
      firstName: null,
      middleName: null,
      phone: guarantor.phone,
      address: guarantor.address,
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
      createdAt: true,
      createdByUser: { select: { fullName: true } },
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
    createdAt: Date;
    createdByUser: { fullName: string } | null;
    member: ApplicationSummary['member'] | null;
  }): ApplicationSummary {
    if (!row.member) {
      throw new NotFoundException();
    }
    return {
      id: row.id,
      applicationNumber: row.applicationNumber,
      status: row.status,
      registeredAt: row.createdAt.toISOString(),
      registeredBy: row.createdByUser?.fullName ?? null,
      member: row.member,
    };
  }
}
