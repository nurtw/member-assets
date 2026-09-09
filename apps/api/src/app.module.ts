import { Module } from '@nestjs/common';

import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DocsModule } from './docs/docs.module.js';
import { HealthModule } from './health/health.module.js';
import { MasterDataModule } from './master-data/master-data.module.js';
import { OrganisationModule } from './organisation/organisation.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

/**
 * Root module.
 *
 * ARCHITECTURE.md §4 — the fifteen modules of PRD §19 are each realised as a
 * discrete NestJS module registered here. Modules communicate only through
 * injected services with declared interfaces; none reaches into another module's
 * Prisma models directly (Decision 4.1).
 *
 * Modules are added as their roadmap items land.
 */
@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AuthModule,
    DocsModule,
    HealthModule,
    OrganisationModule,
    MasterDataModule,
  ],
})
export class AppModule {}
