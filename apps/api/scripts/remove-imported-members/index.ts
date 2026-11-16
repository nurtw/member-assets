import path from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import {
  RemovalBlockedError,
  assessRemoval,
  removeImportedMembers,
  type RemovalAssessment,
} from './removal.ts';

/**
 * `pnpm --filter api remove:imported-members` — deletes the imported members
 * (roadmap item 58, `QUESTIONS.md` MIG-08).
 *
 *   (no flags)                   dry run: prints counts, changes nothing
 *   --execute --confirm <N>      deletes, where N is the number of members the
 *                                dry run printed
 *
 * It reads `DATABASE_URL` from `.env`, which points at the shared Neon
 * database. It prints the database's host name, never the connection string, so
 * you can see which database it is about to act on. A restore point is written
 * to `data/restore-points/` first; that folder holds real personal data and is
 * ignored by version control.
 */

const repoRoot = path.resolve(import.meta.dirname, '../../../..');
const restoreDirectory = path.join(repoRoot, 'data', 'restore-points');

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : (process.argv[index + 1] ?? '');
}

function print(assessment: RemovalAssessment): void {
  const { counts, blockers } = assessment;
  console.log('Would delete:');
  console.log(`  members ................ ${counts.members}`);
  console.log(`  their contact rows ..... ${counts.contacts}`);
  console.log(`  next of kin ............ ${counts.nextOfKin}`);
  console.log(`  guarantors ............. ${counts.guarantors}`);
  console.log(`  identities (NIN) ....... ${counts.identities}`);
  console.log(`  text messages .......... ${counts.smsMessages}`);
  console.log(`  photograph/signature rows ${counts.mediaAssets}`);
  console.log(`Would unlink the driver on ${counts.vehiclesUnlinked} vehicles (kept).`);
  console.log(`Members who are not imported, untouched: ${assessment.keptMembers}`);
  if (assessment.blocked) {
    console.log('\nBLOCKED. Imported members hold:');
    console.log(`  cards .................. ${blockers.cards}`);
    console.log(`  dedicated accounts ..... ${blockers.dedicatedAccounts}`);
    console.log(`  dedicated transfers .... ${blockers.dedicatedTransfers}`);
    console.log(`  payments ............... ${blockers.payments}`);
    console.log(`  applications ........... ${blockers.applications}`);
  }
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

try {
  console.log(`Database host: ${new URL(connectionString).hostname}\n`);
  const assessment = await assessRemoval(prisma);
  print(assessment);

  if (assessment.counts.members === 0) {
    console.log('\nNo imported members. Nothing to do.');
  } else if (assessment.blocked) {
    process.exitCode = 2;
  } else if (!process.argv.includes('--execute')) {
    console.log(
      `\nDry run. Nothing was changed.\nTo delete: --execute --confirm ${assessment.counts.members}`,
    );
  } else if (flag('--confirm') !== String(assessment.counts.members)) {
    console.error(
      `\nRefused: --confirm must be the number of members above (${assessment.counts.members}).`,
    );
    process.exitCode = 1;
  } else {
    const result = await removeImportedMembers(prisma, { restoreDirectory });
    console.log(`\nDeleted ${result.counts.members} members.`);
    console.log(`Restore point: ${result.restorePoint}`);
    console.log(
      'The photograph and signature FILES in object storage were not removed; the restore point lists their keys.',
    );
  }
} catch (error) {
  if (error instanceof RemovalBlockedError) {
    process.exitCode = 2;
  } else {
    console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
