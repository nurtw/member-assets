import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../prisma/prisma.service.js';
import { HealthController } from './health.controller.js';

/**
 * PRD §12.3 — health must report status without revealing internal
 * infrastructure details. These tests pin both halves: that the database is
 * genuinely checked, and that a failure never describes itself to the caller.
 */
describe('HealthController', () => {
  let queryRaw: ReturnType<typeof vi.fn>;
  let controller: HealthController;
  let response: Response;
  let status: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    queryRaw = vi.fn();
    controller = new HealthController({
      $queryRaw: queryRaw,
    } as unknown as PrismaService);

    status = vi.fn();
    response = { status } as unknown as Response;
  });

  it('reports ok when the database answers', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const result = await controller.check(response);

    expect(result.status).toBe('ok');
    expect(status).not.toHaveBeenCalled();
  });

  it('actually queries the database rather than assuming health', async () => {
    queryRaw.mockResolvedValue([]);

    await controller.check(response);

    // A health check that never touches its dependency reports success while
    // the service is unusable, which is worse than having no check at all.
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('reports degraded with 503 when the database is unreachable', async () => {
    queryRaw.mockRejectedValue(
      new Error('connection refused at 10.1.2.3:5432'),
    );

    const result = await controller.check(response);

    expect(result.status).toBe('degraded');
    expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });

  it('never discloses why it is degraded', async () => {
    // The rejection carries a host and port. None of it may reach the caller:
    // this endpoint is unauthenticated, so anything returned is public.
    queryRaw.mockRejectedValue(
      new Error('connection refused at 10.1.2.3:5432'),
    );

    const result = await controller.check(response);
    const serialised = JSON.stringify(result);

    expect(serialised).not.toContain('10.1.2.3');
    expect(serialised).not.toContain('5432');
    expect(serialised).not.toMatch(/database|postgres|prisma|connection/i);
    expect(Object.keys(result).sort()).toEqual(['status', 'timestamp']);
  });

  it('returns an ISO-8601 timestamp', async () => {
    queryRaw.mockResolvedValue([]);

    const result = await controller.check(response);

    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });
});
