import { Controller, Get } from '@nestjs/common';

/**
 * PRD §12.3 — `GET /api/v1/health` returns service health **without revealing
 * internal infrastructure details**.
 *
 * The response is deliberately minimal. It carries no version string, hostname,
 * dependency status, uptime, or build identifier. This endpoint is reachable
 * without authentication, so anything disclosed here is disclosed to everyone,
 * including someone probing for an exploitable dependency version.
 *
 * Where the Union later needs richer diagnostics, add a second authenticated
 * endpoint rather than enriching this one.
 */
export interface HealthResponse {
  readonly status: 'ok';
  readonly timestamp: string;
}

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
