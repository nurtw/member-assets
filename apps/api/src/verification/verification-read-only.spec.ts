import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * "Verification is read-only, without exception" (CLAUDE.md rule 1, PRD
 * §9.5–9.6). A check must never create, complete, or reactivate a
 * declaration, sticker, card, member, or payment.
 *
 * The verification module holds a Prisma client for its reads, so the rule is
 * enforced here as a tripwire: any write call in the module's source fails
 * this test. Its only write is the audit event, made through `AuditService`.
 * The end-to-end suite checks the same rule against the database.
 */
const WRITE_CALLS =
  /\.(create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)\s*\(|\$executeRaw|\$executeRawUnsafe|\$queryRaw|\$queryRawUnsafe|\$transaction/;

describe('the verification module is read-only', () => {
  const directory = dirname(fileURLToPath(import.meta.url));
  const sources = readdirSync(directory).filter(
    (name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'),
  );

  it('has source files to inspect', () => {
    expect(sources).toContain('verification.service.ts');
  });

  it.each(sources)('%s makes no write call', (name) => {
    const source = readFileSync(join(directory, name), 'utf8');
    expect(source).not.toMatch(WRITE_CALLS);
  });
});
