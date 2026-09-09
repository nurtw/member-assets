import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma 7 configuration.
 *
 * The connection string moved out of `schema.prisma` in Prisma 7. It lives here
 * for migration and introspection commands; the runtime client receives a driver
 * adapter instead (see `src/prisma/prisma.service.ts`).
 *
 * `dotenv/config` is imported explicitly because Prisma 7 no longer loads `.env`
 * implicitly when a config file is present.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
