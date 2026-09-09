import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { loadEnvironment } from './config/environment.js';

async function bootstrap(): Promise<void> {
  const env = loadEnvironment();

  const app = await NestFactory.create(AppModule, {
    // Request bodies are capped per PRD §14.3. Applied at creation so it holds
    // for every route, including any added later without thinking about it.
    bodyParser: true,
  });

  /**
   * ARCHITECTURE.md Decision 11.1 — all external routes are prefixed `/api/v1`
   * from the first release. Version 1 is never broken once an external client
   * holds credentials against it; breaking changes ship as `/api/v2`, served
   * concurrently.
   *
   * Set here rather than repeated on each controller so a new controller cannot
   * accidentally be published unversioned.
   */
  app.setGlobalPrefix('api/v1');

  /**
   * Browser access is restricted to explicitly configured origins. The external
   * verification API is machine-to-machine and authenticated by token
   * (ARCHITECTURE.md Decision 9.8); it does not rely on CORS for its security,
   * but there is no reason to permit arbitrary origins either.
   */
  if (env.corsOrigins.length > 0) {
    app.enableCors({
      origin: [...env.corsOrigins],
      credentials: true,
    });
  }

  // Allows in-flight requests to complete on redeploy rather than being severed.
  app.enableShutdownHooks();

  await app.listen(env.port);
}

await bootstrap();
