import { Module } from '@nestjs/common';

import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

/**
 * Root module.
 *
 * ARCHITECTURE.md §4 — the fifteen modules of PRD §19 are each realised as a
 * discrete NestJS module registered here. Modules communicate only through
 * injected services with declared interfaces; none reaches into another module's
 * Prisma models directly (Decision 4.1).
 *
 * Modules are added as their roadmap items land. `health` is the only one present
 * at the scaffold stage.
 */
@Module({
  imports: [PrismaModule, HealthModule],
})
export class AppModule {}
