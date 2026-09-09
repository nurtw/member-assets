import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { loadEnvironment } from '../config/environment.js';

/**
 * Prisma client lifecycle, bound to Nest's.
 *
 * Prisma 7 removed `url` from the datasource block, so the runtime connection is
 * supplied here through a driver adapter. The connection string is environment
 * configuration and never appears in code (ARCHITECTURE.md Decision 12.1), which
 * is what allows the database to move between Neon regions — or off Neon
 * entirely — without a domain change.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const env = loadEnvironment();
    super({
      adapter: new PrismaPg({ connectionString: env.databaseUrl }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    // Paired with app.enableShutdownHooks() in main.ts, so a redeploy closes
    // connections rather than leaving them for the server to time out.
    await this.$disconnect();
  }
}
