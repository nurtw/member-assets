import { NestFactory } from '@nestjs/core';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { AppModule } from '../app.module.js';
import { OpenApiService } from './openapi.service.js';

/**
 * Writes `docs/reference/openapi.json` from the running application.
 *
 * Committed rather than generated on demand, so that a change to the API's
 * authorisation surface appears as a diff someone has to read in review, instead
 * of living in a file nobody regenerates until an integrator complains.
 *
 * Lives under `src/` and runs from the build output, not from source. Node's
 * `--experimental-strip-types` cannot strip decorators, and every Nest module
 * this must load is decorated — the same constraint that keeps
 * `password-hashing.ts` decorator-free for the seed.
 *
 * Run with `pnpm --filter api docs:openapi`.
 */
const target = resolve(process.cwd(), '../../docs/reference/openapi.json');

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error'],
});

const document = app.get(OpenApiService).getDocument();

await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

console.log(`Wrote ${target}`);

await app.close();
