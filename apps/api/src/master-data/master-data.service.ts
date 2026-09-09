import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateLgaInput,
  CreateMasterDataInput,
  LgaEntry,
  MasterDataEntry,
  UpdateLgaInput,
  UpdateMasterDataInput,
} from '@nurtw/contracts';
import type { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ActorContext } from '../organisation/organisation.service.js';

/**
 * The two collections sharing an identical shape. LGAs differ and are handled
 * separately rather than forced into the same signature.
 */
export type CodedCollection = 'vehicle-categories' | 'designations';

/**
 * Master data (PRD §23.4) — the lists the Union administers for itself.
 *
 * **`canAnywhere` is the correct check here, deliberately.** Vehicle categories,
 * designations, and local government areas are Union-wide reference data
 * belonging to no branch, so there is no record path to scope against and the
 * guard's coarse check is the whole check. This is the exception to the
 * item-03 rule that record-touching routes must use `can`; a reader applying
 * that rule mechanically here would be looking for a scope that does not exist.
 *
 * Two invariants hold throughout:
 *
 * - **Nothing is hard-deleted.** A category is referenced by 1,075 vehicles;
 *   removing the row would either fail on a foreign key or orphan the records
 *   that point at it. Entries are deactivated, which keeps history readable and
 *   stops the value being offered for new records (domain rule 5).
 * - **Codes are immutable.** A code is a foreign key in all but name — it appears
 *   in the legacy import mapping and in operational queries. Editing the label
 *   is administration; editing the code is a silent data migration.
 */
@Injectable()
export class MasterDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- Vehicle categories and designations ---------------------------------

  async listCoded(
    collection: CodedCollection,
    includeInactive: boolean,
  ): Promise<MasterDataEntry[]> {
    const where = includeInactive ? {} : { isActive: true };
    const orderBy: Prisma.VehicleCategoryOrderByWithRelationInput[] = [
      { sortOrder: 'asc' },
      { label: 'asc' },
    ];

    return collection === 'vehicle-categories'
      ? this.prisma.vehicleCategory.findMany({ where, orderBy })
      : this.prisma.designation.findMany({ where, orderBy });
  }

  async createCoded(
    actor: ActorContext,
    collection: CodedCollection,
    input: CreateMasterDataInput,
  ): Promise<MasterDataEntry> {
    await this.assertCodeAvailable(collection, input.code);

    return this.prisma.$transaction(async (tx) => {
      const data = {
        code: input.code,
        label: input.label,
        sortOrder: input.sortOrder ?? 0,
      };

      const row =
        collection === 'vehicle-categories'
          ? await tx.vehicleCategory.create({ data })
          : await tx.designation.create({ data });

      await this.audit.record(
        {
          action: `master_data.create`,
          subjectType: this.subjectType(collection),
          subjectId: row.id,
          actorUserId: actor.userId,
          after: this.codedView(row),
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return row;
    });
  }

  async updateCoded(
    actor: ActorContext,
    collection: CodedCollection,
    id: string,
    input: UpdateMasterDataInput,
  ): Promise<MasterDataEntry> {
    const before = await this.findCoded(collection, id);

    return this.prisma.$transaction(async (tx) => {
      const data = {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      };

      const row =
        collection === 'vehicle-categories'
          ? await tx.vehicleCategory.update({ where: { id }, data })
          : await tx.designation.update({ where: { id }, data });

      await this.audit.record(
        {
          action:
            input.isActive === false
              ? 'master_data.deactivate'
              : 'master_data.update',
          subjectType: this.subjectType(collection),
          subjectId: id,
          actorUserId: actor.userId,
          before: this.codedView(before),
          after: this.codedView(row),
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return row;
    });
  }

  // --- Local government areas ----------------------------------------------

  async listLgas(includeInactive: boolean): Promise<LgaEntry[]> {
    return this.prisma.lga.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ stateName: 'asc' }, { name: 'asc' }],
    });
  }

  async createLga(
    actor: ActorContext,
    input: CreateLgaInput,
  ): Promise<LgaEntry> {
    const clash = await this.prisma.lga.findUnique({
      where: { code: input.code },
    });
    if (clash) {
      throw new ConflictException(
        `The code ${input.code} is already in use. Reactivate the existing entry rather than creating a second one.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.lga.create({
        data: {
          code: input.code,
          name: input.name,
          stateName: input.stateName.toUpperCase(),
        },
      });

      await this.audit.record(
        {
          action: 'master_data.create',
          subjectType: 'lga',
          subjectId: row.id,
          actorUserId: actor.userId,
          after: this.lgaView(row),
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return row;
    });
  }

  async updateLga(
    actor: ActorContext,
    id: string,
    input: UpdateLgaInput,
  ): Promise<LgaEntry> {
    const before = await this.prisma.lga.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException();
    }

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.lga.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.stateName !== undefined
            ? { stateName: input.stateName.toUpperCase() }
            : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });

      await this.audit.record(
        {
          action:
            input.isActive === false
              ? 'master_data.deactivate'
              : 'master_data.update',
          subjectType: 'lga',
          subjectId: id,
          actorUserId: actor.userId,
          before: this.lgaView(before),
          after: this.lgaView(row),
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return row;
    });
  }

  // --- Internals -----------------------------------------------------------

  private async findCoded(
    collection: CodedCollection,
    id: string,
  ): Promise<MasterDataEntry> {
    const row =
      collection === 'vehicle-categories'
        ? await this.prisma.vehicleCategory.findUnique({ where: { id } })
        : await this.prisma.designation.findUnique({ where: { id } });

    if (!row) {
      throw new NotFoundException();
    }
    return row;
  }

  private async assertCodeAvailable(
    collection: CodedCollection,
    code: string,
  ): Promise<void> {
    const existing =
      collection === 'vehicle-categories'
        ? await this.prisma.vehicleCategory.findUnique({ where: { code } })
        : await this.prisma.designation.findUnique({ where: { code } });

    if (existing) {
      throw new ConflictException(
        `The code ${code} is already in use. Reactivate the existing entry rather than creating a second one.`,
      );
    }
  }

  private subjectType(collection: CodedCollection): string {
    return collection === 'vehicle-categories'
      ? 'vehicle_category'
      : 'designation';
  }

  private codedView(row: MasterDataEntry): Prisma.InputJsonObject {
    return {
      code: row.code,
      label: row.label,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
    };
  }

  private lgaView(row: LgaEntry): Prisma.InputJsonObject {
    return {
      code: row.code,
      name: row.name,
      stateName: row.stateName,
      isActive: row.isActive,
    };
  }
}
