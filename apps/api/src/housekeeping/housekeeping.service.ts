import {
  Global,
  Injectable,
  Logger,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import { loadEnvironment } from '../config/environment.js';

/**
 * How often the housekeeping jobs run. Neon scales its compute to zero after
 * five minutes with no query, and each run wakes it for about that long, so a
 * job every hour kept the database up for roughly 8 per cent of every day for
 * work that is never urgent. Every six hours is about 2 per cent.
 *
 * What waits: the held-credit sweep pays a member's held money into a due that
 * fell since it arrived (at most this long after it fell), an unapproved
 * application lapses after its days (not hours), and the counters and logs are
 * pruned by the day.
 */
export const HOUSEKEEPING_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** The first run, after start-up has settled and the first requests are served. */
const FIRST_RUN_DELAY_MS = 60_000;

export type HousekeepingTask = () => Promise<unknown>;

/**
 * One timer for every periodic job that touches the database.
 *
 * A service that has periodic work registers it here from `onModuleInit`
 * instead of starting a timer of its own, so the jobs run together, in one
 * wake of the database, and so a new one cannot quietly add a timer that keeps
 * the database up. Nothing in this System polls the database: a job that must
 * react to an event is called by the event, as the SMS outbox is.
 *
 * Under `NODE_ENV=test` nothing runs by itself; suites call the jobs directly,
 * or `runOnce()`.
 */
@Injectable()
export class HousekeepingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HousekeepingService.name);
  private readonly tasks = new Map<string, HousekeepingTask>();
  private firstRun: NodeJS.Timeout | undefined;
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  /** Adds a job. Registering the same name again replaces it. */
  register(name: string, task: HousekeepingTask): void {
    this.tasks.set(name, task);
  }

  onModuleInit(): void {
    if (loadEnvironment().nodeEnv === 'test') {
      return;
    }
    this.firstRun = setTimeout(() => void this.runOnce(), FIRST_RUN_DELAY_MS);
    this.firstRun.unref();
    this.timer = setInterval(() => void this.runOnce(), HOUSEKEEPING_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearTimeout(this.firstRun);
    clearInterval(this.timer);
  }

  /**
   * Runs every job, one after another. One job's failure is logged and does not
   * hold up the rest. Returns the names of the jobs that failed.
   */
  async runOnce(): Promise<string[]> {
    if (this.running) {
      return [];
    }
    this.running = true;
    const failed: string[] = [];
    try {
      for (const [name, task] of this.tasks) {
        try {
          await task();
        } catch (error) {
          failed.push(name);
          this.logger.error(`Housekeeping "${name}" failed: ${String(error)}`);
        }
      }
    } finally {
      this.running = false;
    }
    return failed;
  }
}

/** Global: any service with periodic work registers it through this one. */
@Global()
@Module({
  providers: [HousekeepingService],
  exports: [HousekeepingService],
})
export class HousekeepingModule {}
