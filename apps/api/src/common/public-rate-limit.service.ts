import {
  Global,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Module,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createHash } from 'node:crypto';

import { loadEnvironment } from '../config/environment.js';
import { PrismaService } from '../prisma/prisma.service.js';

const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A limit refusal, carrying when to try again (`Retry-After`). */
export class PublicRateLimitedException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
  }
}

/**
 * Per-address limits for the routes anyone can reach without signing in: the
 * pay page (item 31) and the portal's application form and sign-in (item 29).
 *
 * One counter per purpose, address, and window, written in one atomic
 * statement, as item 13's counters are. Nothing else writes
 * `public_rate_counter`. The address is stored as a hash, and rows are pruned
 * after a day.
 *
 * What the limit *is* stays with the caller, read from a setting: this only
 * counts.
 */
@Injectable()
export class PublicRateLimitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PublicRateLimitService.name);
  private pruneTimer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    // Suites call `prune()` themselves, as they do for item 13's counters.
    if (loadEnvironment().nodeEnv === 'test') {
      return;
    }
    this.pruneTimer = setInterval(() => {
      void this.prune().catch((error: unknown) =>
        this.logger.error(`Public counter prune failed: ${String(error)}`),
      );
    }, PRUNE_INTERVAL_MS);
    this.pruneTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
    }
  }

  /**
   * Counts one request and refuses it once `allowed` is passed in the window.
   * A request with no address shares one counter, so it cannot escape the
   * limit by hiding where it came from.
   */
  async hit(
    purpose: string,
    address: string | undefined,
    allowed: number,
    windowMs: number,
  ): Promise<void> {
    const now = Date.now();
    const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
    const key = `${purpose}:${createHash('sha256')
      .update(address ?? 'unknown')
      .digest('hex')}`;
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO public_rate_counter (key, window_start, count)
      VALUES (${key}, ${windowStart}, 1)
      ON CONFLICT (key, window_start)
      DO UPDATE SET count = public_rate_counter.count + 1
      RETURNING count`;
    if ((rows[0]?.count ?? 0) > allowed) {
      throw new PublicRateLimitedException(
        Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now) / 1000)),
      );
    }
  }

  /** Deletes counters older than a day. */
  async prune(now: Date = new Date()): Promise<void> {
    await this.prisma.publicRateCounter.deleteMany({
      where: { windowStart: { lt: new Date(now.getTime() - DAY_MS) } },
    });
  }
}

/** Global: any module with a public route counts through this one service. */
@Global()
@Module({
  providers: [PublicRateLimitService],
  exports: [PublicRateLimitService],
})
export class PublicRateLimitModule {}
