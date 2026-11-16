import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { activateOpenApplications, assessActivation } from './activation.ts';

/**
 * `pnpm --filter api activate:open-applications` — makes the applications that
 * were still open when registration became immediate into active members
 * (roadmap item 61, `QUESTIONS.md` MEM-20).
 *
 *   (no flags)                   dry run: prints counts, changes nothing
 *   --execute --confirm <N>      activates, where N is the number the dry run printed
 *
 * It reads `DATABASE_URL` from `.env`, which points at the shared Neon database,
 * and prints the database's host name, never the connection string, so you can
 * see which database it is about to act on. It prints counts and never a name.
 * It deletes nothing, and a second run finds nothing open.
 */

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : (process.argv[index + 1] ?? '');
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

try {
  console.log(`Database host: ${new URL(connectionString).hostname}\n`);
  const assessment = await assessActivation(prisma);
  const total = assessment.applicationIds.length;
  console.log('Would make active members:');
  console.log(`  drafts ................. ${assessment.counts.draft}`);
  console.log(`  submitted .............. ${assessment.counts.submitted}`);
  console.log(`  under review ........... ${assessment.counts.underReview}`);
  console.log(`  total .................. ${total}`);
  console.log(`Already approved, untouched: ${assessment.alreadyApproved}`);

  if (total === 0) {
    console.log('\nNothing is open. Nothing to do.');
  } else if (!process.argv.includes('--execute')) {
    console.log(
      `\nDry run. Nothing was changed.\nTo activate: --execute --confirm ${total}`,
    );
  } else if (flag('--confirm') !== String(total)) {
    console.error(`\nRefused: --confirm must be the total above (${total}).`);
    process.exitCode = 1;
  } else {
    const result = await activateOpenApplications(prisma);
    console.log(`\nMade ${result.activated} members active, each with a membership number.`);
    const after = await assessActivation(prisma);
    console.log(`Still open: ${after.applicationIds.length}`);
  }
} catch (error) {
  console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
