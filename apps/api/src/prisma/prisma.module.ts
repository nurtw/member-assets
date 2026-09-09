import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service.js';

/**
 * Global so that every domain module can inject the client without re-importing
 * this module.
 *
 * This is NOT a licence to reach across module boundaries. ARCHITECTURE.md
 * Decision 4.1 still holds: no module queries another module's models directly,
 * and cross-module reads go through an explicit method on the owning module's
 * service (Decision 4.2). Shared access to the client is not shared ownership of
 * the data.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
