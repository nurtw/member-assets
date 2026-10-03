import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateDisclosureProfileInput,
  DisclosureProfileSummary,
  UpdateDisclosureProfileInput,
} from '@nurtw/contracts';
import { VERIFICATION_FIELD_NAMES } from '@nurtw/domain';
import { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** An organisation whose access was withdrawn no longer holds its profile. */
const HOLDING = { status: { not: 'REVOKED' } } as const;

const PROFILE_SELECT = {
  id: true,
  code: true,
  label: true,
  description: true,
  isSystem: true,
  isActive: true,
  fields: { select: { fieldPath: true } },
  _count: { select: { clients: { where: HOLDING } } },
} as const;

type ProfileRow = Prisma.DisclosureProfileGetPayload<{
  select: typeof PROFILE_SELECT;
}>;

/**
 * Disclosure profiles (PRD §15, ARCHITECTURE.md Decision 5.2 — item 11).
 *
 * Profiles are rows, so the Union admits a new kind of outside organisation,
 * or changes what one is told, without a release (Requirement 15.1). This
 * service is the only writer.
 *
 * Union-wide, like master data and fee types: a profile belongs to no branch,
 * so the guard's permission check is the whole check.
 *
 * Two rules protect what a profile means:
 *
 * - **A seeded profile is never amended here.** "Minimal verification" must go
 *   on meaning what PRD §15 says it means. The Union composes its own beside it.
 * - **A profile names only external-admissible fields.** The request schema
 *   refuses anything else, and `projectVerification` drops an internal-only
 *   field on the external channel whatever a row says.
 */
@Injectable()
export class DisclosureProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<DisclosureProfileSummary[]> {
    const rows = await this.prisma.disclosureProfile.findMany({
      select: PROFILE_SELECT,
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => this.toSummary(row));
  }

  /** The profiles an organisation can be given now. */
  async listAssignable(): Promise<DisclosureProfileSummary[]> {
    return (await this.list()).filter((profile) => profile.isActive);
  }

  /**
   * The profile an organisation is about to be given, for the `api-client`
   * module (Decision 4.2). 404 when there is no such profile, 409 when it has
   * been withdrawn from use.
   */
  async requireAssignable(
    id: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<{ id: string; code: string }> {
    const profile = await client.disclosureProfile.findUnique({
      where: { id },
      select: { id: true, code: true, isActive: true },
    });
    if (!profile) {
      throw new NotFoundException();
    }
    if (!profile.isActive) {
      throw new ConflictException('That profile is no longer offered.');
    }
    return { id: profile.id, code: profile.code };
  }

  async create(
    actor: ActorContext,
    input: CreateDisclosureProfileInput,
  ): Promise<DisclosureProfileSummary> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.disclosureProfile.create({
          data: {
            code: input.code,
            label: input.label,
            description: input.description || null,
            // Never from the body: a system profile is one the seed defines.
            isSystem: false,
            fields: {
              create: input.fields.map((fieldPath) => ({ fieldPath })),
            },
          },
          select: PROFILE_SELECT,
        });
        const summary = this.toSummary(row);

        await this.audit.record(
          {
            action: 'disclosure_profile.create',
            subjectType: 'disclosure_profile',
            subjectId: row.id,
            actorUserId: actor.userId,
            after: {
              code: summary.code,
              label: summary.label,
              fields: summary.fields,
            },
            requestId: actor.requestId,
            ipAddress: actor.ipAddress,
          },
          tx,
        );
        return summary;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A profile with that code exists.');
      }
      throw error;
    }
  }

  /**
   * Amends a profile the Union composed. A change of fields applies, from the
   * next request, to every organisation holding the profile, so the audit
   * event records how many that is.
   */
  async update(
    actor: ActorContext,
    id: string,
    input: UpdateDisclosureProfileInput,
  ): Promise<DisclosureProfileSummary> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.disclosureProfile.findUnique({
        where: { id },
        select: PROFILE_SELECT,
      });
      if (!existing) {
        throw new NotFoundException();
      }
      if (existing.isSystem) {
        throw new ConflictException('A system profile cannot be amended.');
      }
      const before = this.toSummary(existing);

      // Withdrawing a profile somebody holds would leave their access resting
      // on a profile the Union has said it no longer offers. They are moved to
      // another profile first.
      if (
        input.isActive === false &&
        before.isActive &&
        before.clientCount > 0
      ) {
        throw new ConflictException(
          'Organisations still hold that profile. Move them to another first.',
        );
      }

      if (input.fields !== undefined) {
        await tx.disclosureField.deleteMany({ where: { profileId: id } });
        await tx.disclosureField.createMany({
          data: input.fields.map((fieldPath) => ({ profileId: id, fieldPath })),
        });
      }
      const row = await tx.disclosureProfile.update({
        where: { id },
        data: {
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.description !== undefined
            ? {
                description:
                  input.description === '' ? null : input.description,
              }
            : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        select: PROFILE_SELECT,
      });
      const after = this.toSummary(row);

      await this.audit.record(
        {
          action: 'disclosure_profile.update',
          subjectType: 'disclosure_profile',
          subjectId: id,
          actorUserId: actor.userId,
          before: {
            code: before.code,
            label: before.label,
            description: before.description,
            isActive: before.isActive,
            fields: before.fields,
          },
          after: {
            code: after.code,
            label: after.label,
            description: after.description,
            isActive: after.isActive,
            fields: after.fields,
            organisationsAffected: after.clientCount,
          },
          reason: input.reason,
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );
      return after;
    });
  }

  private toSummary(row: ProfileRow): DisclosureProfileSummary {
    // Catalogue order, so two profiles naming the same fields read the same.
    // A name the catalogue no longer holds sorts last; it discloses nothing.
    const position = (field: string) => {
      const index = (VERIFICATION_FIELD_NAMES as readonly string[]).indexOf(
        field,
      );
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };
    return {
      id: row.id,
      code: row.code,
      label: row.label,
      description: row.description,
      isSystem: row.isSystem,
      isActive: row.isActive,
      fields: row.fields
        .map((field) => field.fieldPath)
        .sort((a, b) => position(a) - position(b) || a.localeCompare(b)),
      clientCount: row._count.clients,
    };
  }
}
