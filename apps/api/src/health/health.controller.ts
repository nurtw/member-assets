import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';

import { PrismaService } from '../prisma/prisma.service.js';

/**
 * PRD §12.3 — `GET /api/v1/health` returns service health **without revealing
 * internal infrastructure details**.
 *
 * The response is deliberately minimal. It carries no version string, hostname,
 * dependency name, uptime, or build identifier. This endpoint is reachable
 * without authentication, so anything disclosed here is disclosed to everyone,
 * including someone probing for an exploitable dependency version.
 *
 * The health of the database is checked but never described: a caller learns
 * that the service is degraded, not which component failed. Operators get that
 * from logs, which are not public. The HTTP status carries the signal a load
 * balancer needs.
 *
 * Where the Union later needs richer diagnostics, add a second *authenticated*
 * endpoint rather than enriching this one.
 */
export interface HealthResponse {
  readonly status: 'ok' | 'degraded';
  readonly timestamp: string;
}

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check(
    @Res({ passthrough: true }) response: Response,
  ): Promise<HealthResponse> {
    const timestamp = new Date().toISOString();

    try {
      // A trivial round trip. Enough to prove the connection is live without
      // touching a domain table or holding a lock.
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', timestamp };
    } catch {
      // Deliberately swallowed. The reason is logged by the exception filter's
      // logger elsewhere; it is never returned to an unauthenticated caller.
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: 'degraded', timestamp };
    }
  }
}
