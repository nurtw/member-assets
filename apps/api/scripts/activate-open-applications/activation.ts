import { randomInt } from 'node:crypto';

import { generateIdentifier } from '@nurtw/domain';
import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Making the open applications members (roadmap item 61, `plans/61-immediate-registration.md`;
 * `QUESTIONS.md` MEM-20, answered 16 November 2026).
 *
 * Registering now makes a member active at once, so there is no review. Before
 * that, an application could wait as a draft or submitted, with its person a
 * `PENDING` member and no membership number. The owner decided those people
 * become active members, by the rules a new registration follows: each gets a
 * membership number, and the application is marked approved.
 *
 * It deletes nothing and is safe to run twice: a second run finds none open.
 * The membership fee is owed from the day this runs, as it is from the day a
 * registration is saved (`DuesService` reads the application's `reviewedAt`).
 *
 * Plain TypeScript with no decorators, so the command can run it under
 * `--experimental-strip-types` and a test can import it.
 */

/** Narrows which applications are meant. The command passes nothing; a test passes ids of its own. */
export interface ActivationScope {
  readonly applicationIds?: readonly string[];
}

export interface ActivationAssessment {
  readonly applicationIds: readonly string[];
  readonly counts: {
    readonly draft: number;
    readonly submitted: number;
    readonly underReview: number;
  };
  /** Applications already approved, and so untouched. */
  readonly alreadyApproved: number;
}

const OPEN = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW'] as const;
const ATTEMPTS = 5;

function openWhere(scope: ActivationScope): Prisma.MembershipApplicationWhereInput {
  return {
    status: { in: [...OPEN] },
    member: { status: 'PENDING' },
    ...(scope.applicationIds ? { id: { in: [...scope.applicationIds] } } : {}),
  };
}

export async function assessActivation(
  prisma: PrismaClient,
  scope: ActivationScope = {},
): Promise<ActivationAssessment> {
  const open = await prisma.membershipApplication.findMany({
    where: openWhere(scope),
    select: { id: true, status: true },
  });
  const count = (status: string) => open.filter((row) => row.status === status).length;
  const alreadyApproved = await prisma.membershipApplication.count({
    where: {
      status: 'APPROVED',
      ...(scope.applicationIds ? { id: { in: [...scope.applicationIds] } } : {}),
    },
  });
  return {
    applicationIds: open.map((row) => row.id),
    counts: {
      draft: count('DRAFT'),
      submitted: count('SUBMITTED'),
      underReview: count('UNDER_REVIEW'),
    },
    alreadyApproved,
  };
}

async function allocateMembershipNumber(tx: Prisma.TransactionClient): Promise<string> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const candidate = generateIdentifier(() => randomInt(256));
    const clash = await tx.member.findUnique({
      where: { membershipNumber: candidate },
      select: { id: true },
    });
    if (!clash) {
      return candidate;
    }
  }
  throw new Error('Could not allocate a membership number. Nothing was changed.');
}

/** Activates every open application in scope, in one transaction: all or none. */
export async function activateOpenApplications(
  prisma: PrismaClient,
  scope: ActivationScope = {},
): Promise<{ activated: number }> {
  return prisma.$transaction(
    async (tx) => {
      // Read again inside the transaction, so a registration saved a moment ago,
      // or a run that raced this one, is neither missed nor done twice.
      const open = await tx.membershipApplication.findMany({
        where: openWhere(scope),
        select: {
          id: true,
          applicationNumber: true,
          status: true,
          member: { select: { id: true, organisationId: true } },
        },
        orderBy: { createdAt: 'asc' },
      });

      const now = new Date();
      for (const application of open) {
        if (!application.member) {
          continue;
        }
        const membershipNumber = await allocateMembershipNumber(tx);
        await tx.member.update({
          where: { id: application.member.id },
          data: { status: 'ACTIVE', membershipNumber },
        });
        await tx.membershipApplication.update({
          where: { id: application.id },
          data: { status: 'APPROVED', reviewedAt: now },
        });
        await tx.auditEvent.create({
          data: {
            action: 'member.register',
            subjectType: 'membership_application',
            subjectId: application.id,
            organisationId: application.member.organisationId,
            beforeValue: { status: application.status, memberStatus: 'PENDING' },
            afterValue: {
              applicationNumber: application.applicationNumber,
              status: 'APPROVED',
              memberStatus: 'ACTIVE',
              membershipNumber,
              memberId: application.member.id,
              madeActiveFromOpenApplication: true,
            },
            reason:
              'The project owner decided that open applications become active members (QUESTIONS.md MEM-20).',
          },
        });
      }
      return { activated: open.length };
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}
