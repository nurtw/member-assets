import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Removing the imported members (roadmap item 58, `plans/58-remove-imported-members.md`;
 * `QUESTIONS.md` MIG-08, the owner's direction of 16 November 2026).
 *
 * A **hard delete**, the owner's explicit choice. It departs on purpose from the
 * rule that history is never hard-deleted (`CLAUDE.md`, domain rule 5), so it is
 * done once, by this script, and never by a route in the API.
 *
 * An imported member is one with a `legacy_id`. A member registered through the
 * System has none, and is never read, changed, or deleted here: the transaction
 * counts them before and after, and rolls back if the number moved.
 *
 * Plain TypeScript with no decorators, so the command can run it under
 * `--experimental-strip-types` and a test can import it.
 */

/** Narrows which imported members are meant. The command passes nothing; a test passes a prefix of its own. */
export interface RemovalScope {
  readonly legacyIdStartsWith?: string;
}

export interface RemovalCounts {
  readonly members: number;
  readonly vehiclesUnlinked: number;
  readonly contacts: number;
  readonly nextOfKin: number;
  readonly guarantors: number;
  readonly identities: number;
  readonly smsMessages: number;
  readonly mediaAssets: number;
}

/** What stops the delete. Each is money, a credential, or an application, which the owner decides separately. */
export interface RemovalBlockers {
  readonly cards: number;
  readonly dedicatedAccounts: number;
  readonly dedicatedTransfers: number;
  readonly payments: number;
  readonly applications: number;
}

export interface RemovalAssessment {
  readonly memberIds: readonly string[];
  readonly mediaAssetIds: readonly string[];
  readonly counts: RemovalCounts;
  readonly blockers: RemovalBlockers;
  readonly blocked: boolean;
  /** Members that are not imported, and so are not touched. */
  readonly keptMembers: number;
}

export class RemovalBlockedError extends Error {
  // Not a parameter property: `--experimental-strip-types` cannot strip one.
  readonly assessment: RemovalAssessment;

  constructor(assessment: RemovalAssessment) {
    super('Imported members hold cards, accounts, payments, or applications.');
    this.assessment = assessment;
  }
}

export function importedWhere(scope: RemovalScope = {}): Prisma.MemberWhereInput {
  return scope.legacyIdStartsWith
    ? { legacyId: { startsWith: scope.legacyIdStartsWith } }
    : { legacyId: { not: null } };
}

/** Counts what would go and what stops it. Reads only. */
export async function assessRemoval(
  prisma: PrismaClient,
  scope: RemovalScope = {},
): Promise<RemovalAssessment> {
  const where = importedWhere(scope);
  const members = await prisma.member.findMany({
    where,
    select: { id: true, passportPhotoId: true, signatureId: true },
  });
  const memberIds = members.map((member) => member.id);
  const mediaAssetIds = members.flatMap((member) =>
    [member.passportPhotoId, member.signatureId].filter(
      (id): id is string => id !== null,
    ),
  );
  const ofMember = { memberId: { in: memberIds } };

  const [
    vehiclesUnlinked,
    contacts,
    nextOfKin,
    guarantors,
    identities,
    smsMessages,
    cards,
    dedicatedAccounts,
    dedicatedTransfers,
    payments,
    applications,
    keptMembers,
  ] = await Promise.all([
    prisma.vehicle.count({ where: { declaredByMemberId: { in: memberIds } } }),
    prisma.memberContact.count({ where: ofMember }),
    prisma.nextOfKin.count({ where: ofMember }),
    prisma.guarantor.count({ where: ofMember }),
    prisma.memberIdentity.count({ where: ofMember }),
    prisma.smsMessage.count({ where: ofMember }),
    prisma.card.count({ where: ofMember }),
    prisma.dedicatedAccount.count({ where: ofMember }),
    prisma.dedicatedAccountTransfer.count({ where: ofMember }),
    prisma.payment.count({
      where: { subjectType: 'member', subjectId: { in: memberIds } },
    }),
    prisma.membershipApplication.count({ where: ofMember }),
    prisma.member.count({ where: { NOT: where } }),
  ]);

  const blockers: RemovalBlockers = {
    cards,
    dedicatedAccounts,
    dedicatedTransfers,
    payments,
    applications,
  };
  return {
    memberIds,
    mediaAssetIds,
    counts: {
      members: memberIds.length,
      vehiclesUnlinked,
      contacts,
      nextOfKin,
      guarantors,
      identities,
      smsMessages,
      mediaAssets: mediaAssetIds.length,
    },
    blockers,
    blocked: Object.values(blockers).some((count) => count > 0),
    keptMembers,
  };
}

/**
 * Writes everything about to be deleted to one JSON file, so the delete can be
 * undone by hand. It holds real personal data: the caller puts it under `data/`,
 * which version control ignores. Returns the path.
 */
export async function writeRestorePoint(
  prisma: PrismaClient,
  assessment: RemovalAssessment,
  directory: string,
  now: Date,
): Promise<string> {
  const ids = [...assessment.memberIds];
  const ofMember = { memberId: { in: ids } };
  const [
    members,
    contacts,
    nextOfKin,
    guarantors,
    identities,
    smsMessages,
    vehicleLinks,
    mediaAssets,
  ] = await Promise.all([
    prisma.member.findMany({ where: { id: { in: ids } } }),
    prisma.memberContact.findMany({ where: ofMember }),
    prisma.nextOfKin.findMany({ where: ofMember }),
    prisma.guarantor.findMany({ where: ofMember }),
    prisma.memberIdentity.findMany({ where: ofMember }),
    prisma.smsMessage.findMany({ where: ofMember }),
    prisma.vehicle.findMany({
      where: { declaredByMemberId: { in: ids } },
      select: { id: true, declaredByMemberId: true },
    }),
    prisma.mediaAsset.findMany({ where: { id: { in: [...assessment.mediaAssetIds] } } }),
  ]);

  mkdirSync(directory, { recursive: true });
  const file = path.join(
    directory,
    `imported-members-${now.toISOString().replace(/[:.]/g, '-')}.json`,
  );
  const body = {
    note:
      'Restore point taken before the imported members were deleted (MIG-08). ' +
      'Holds real personal data. Never commit it. The media storage keys are listed ' +
      'because the files themselves are not removed by the delete.',
    takenAt: now.toISOString(),
    counts: assessment.counts,
    members,
    contacts,
    nextOfKin,
    guarantors,
    identities,
    smsMessages,
    vehicleLinks,
    mediaAssets,
  };
  writeFileSync(
    file,
    JSON.stringify(body, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2),
    { flag: 'wx' },
  );
  return file;
}

export interface RemovalResult {
  readonly counts: RemovalCounts;
  readonly restorePoint: string;
}

/**
 * Deletes the imported members. Refuses, touching nothing, if any holds a card,
 * a dedicated account or transfer, a payment, or an application. The restore
 * point is written first; the delete is one transaction that also checks that no
 * member who is not imported was touched.
 */
export async function removeImportedMembers(
  prisma: PrismaClient,
  options: { scope?: RemovalScope; restoreDirectory: string; now?: Date },
): Promise<RemovalResult> {
  const scope = options.scope ?? {};
  const now = options.now ?? new Date();
  const assessment = await assessRemoval(prisma, scope);
  if (assessment.blocked) {
    throw new RemovalBlockedError(assessment);
  }

  const restorePoint = await writeRestorePoint(
    prisma,
    assessment,
    options.restoreDirectory,
    now,
  );

  const ids = [...assessment.memberIds];
  await prisma.$transaction(
    async (tx) => {
      await tx.vehicle.updateMany({
        where: { declaredByMemberId: { in: ids } },
        data: { declaredByMemberId: null },
      });
      // Contact, next of kin, guarantor, identity, and text messages go with
      // the member (their references cascade).
      const deleted = await tx.member.deleteMany({ where: { id: { in: ids } } });
      if (deleted.count !== ids.length) {
        throw new Error(
          `Expected to delete ${ids.length} members and deleted ${deleted.count}.`,
        );
      }
      await tx.mediaAsset.deleteMany({
        where: { id: { in: [...assessment.mediaAssetIds] } },
      });

      const kept = await tx.member.count({ where: { NOT: importedWhere(scope) } });
      if (kept !== assessment.keptMembers) {
        throw new Error('A member who was not imported changed. Rolled back.');
      }

      await tx.auditEvent.create({
        data: {
          action: 'member.imported_removed',
          subjectType: 'member',
          afterValue: { ...assessment.counts, keptMembers: assessment.keptMembers },
          reason:
            'The project owner directed that the imported members be deleted (QUESTIONS.md MIG-08).',
        },
      });
    },
    { maxWait: 10_000, timeout: 60_000 },
  );

  return { counts: assessment.counts, restorePoint };
}
