import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type {
  ApiClientLimits,
  ApiClientPause,
  CreateRateLimitProfileInput,
  RateLimitProfileSummary,
  RateLimitProfileValues,
  UpdateRateLimitProfileInput,
} from '@nurtw/contracts';
import {
  advanceSequence,
  bucketRetryAfterSeconds,
  dailyRetryAfterSeconds,
  detectAbuse,
  effectiveDailyQuota,
  hourStart,
  hourlyRetryAfterSeconds,
  isAbuseSignal,
  isObservedOutcome,
  lagosDayStart,
  pauseEnd,
  ratePerMinute,
  routeClassForScope,
  secondsUntil,
  sequencePosition,
  tallyOutcome,
  windowStart,
  type AbuseSignal,
  type RateLimitRefusal,
  type SequenceState,
} from '@nurtw/domain';
import { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service.js';
import { loadEnvironment } from '../config/environment.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** What the guard knows of the organisation a token resolved to. */
export interface LimitedClient {
  readonly clientId: string;
  readonly rateLimitProfile: string;
  /** The organisation's own daily quota, or `null` for its profile's. */
  readonly dailyQuota: number | null;
}

/** Why a request was refused before it ran. Every one answers `429`. */
export type LimitRefusal = RateLimitRefusal | 'PAUSED';

export type Admission =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly refusal: LimitRefusal;
      readonly retryAfterSeconds: number;
    };

/** How a check turned out, and what it presented, for detection. */
export interface Observation {
  readonly resultClass: string;
  /** The normalised plate presented, if one was. */
  readonly plate: string | null;
  /** A Transpay barcode presented, if one was. Never a signed code. */
  readonly code: string | null;
}

const PROFILE_SELECT = {
  code: true,
  label: true,
  description: true,
  verificationPerMinute: true,
  aggregatePerMinute: true,
  burst: true,
  hourlyQuota: true,
  dailyQuota: true,
  windowMinutes: true,
  forgeryThreshold: true,
  missThreshold: true,
  missPercent: true,
  sequenceThreshold: true,
  sequenceReach: true,
  pauseMinutes: true,
  updatedAt: true,
} as const;

type ProfileRow = Prisma.RateLimitProfileGetPayload<{
  select: typeof PROFILE_SELECT;
}>;

const PAUSE_SELECT = {
  signal: true,
  pausedAt: true,
  pausedUntil: true,
  liftedAt: true,
} as const;

/** Counters and detection state are pruned this often, outside tests. */
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function values(row: ProfileRow): RateLimitProfileValues {
  return {
    verificationPerMinute: row.verificationPerMinute,
    aggregatePerMinute: row.aggregatePerMinute,
    burst: row.burst,
    hourlyQuota: row.hourlyQuota,
    dailyQuota: row.dailyQuota,
    windowMinutes: row.windowMinutes,
    forgeryThreshold: row.forgeryThreshold,
    missThreshold: row.missThreshold,
    missPercent: row.missPercent,
    sequenceThreshold: row.sequenceThreshold,
    sequenceReach: row.sequenceReach,
    pauseMinutes: row.pauseMinutes,
  };
}

/**
 * Rate limiting and abuse detection for the external API (PRD §14 — item 13).
 *
 * The two layers of ARCHITECTURE.md Decision 8.1, kept apart:
 *
 * - **`admit`** runs in the guard, after the token is accepted and before the
 *   route. It refuses a paused organisation, then applies the bucket and the
 *   hourly and daily quotas. Each is one atomic statement, so the limits hold
 *   across instances (Decision 8.2).
 * - **`observe`** runs after a check has been answered. It counts how the
 *   check turned out and what was presented, and pauses the organisation when
 *   the pattern amounts to a signal (Requirement 14.2).
 *
 * **Counters live in Postgres** (the owner's direction of 3 October 2026,
 * `QUESTIONS.md` EXT-14): the shared store Decision 8.2 asks for, with no new
 * service. This service is the only code that touches them, so moving them to
 * Redis later changes this file and nothing else.
 *
 * Every number comes from the organisation's limit profile, read on each
 * request, so a change applies to the next one (Decision 8.3).
 */
@Injectable()
export class RateLimitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
  private pruneTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    // Suites call `prune()` themselves, as they call the held-credit sweep.
    if (loadEnvironment().nodeEnv === 'test') {
      return;
    }
    this.pruneTimer = setInterval(() => {
      void this.prune().catch((error: unknown) =>
        this.logger.error(`Rate-limit prune failed: ${String(error)}`),
      );
    }, PRUNE_INTERVAL_MS);
    this.pruneTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
    }
  }

  // --- The quota layer ---------------------------------------------------------

  /**
   * Whether a request from this organisation may proceed. A request let
   * through is counted; one refused is not counted against a quota.
   */
  async admit(
    client: LimitedClient,
    scope: string,
    now: Date = new Date(),
  ): Promise<Admission> {
    const [profile, pause] = await Promise.all([
      this.profileFor(client.rateLimitProfile),
      this.activePause(client.clientId, now),
    ]);
    if (pause) {
      return {
        allowed: false,
        refusal: 'PAUSED',
        retryAfterSeconds: secondsUntil(pause.pausedUntil, now),
      };
    }

    const routeClass = routeClassForScope(scope);
    const perMinute = ratePerMinute(profile, routeClass);
    const bucket = await this.takeToken(
      client.clientId,
      routeClass,
      perMinute,
      profile.burst,
      now,
    );
    if (!bucket.allowed) {
      return {
        allowed: false,
        refusal: 'RATE_LIMITED',
        retryAfterSeconds: bucketRetryAfterSeconds(bucket.tokens, perMinute),
      };
    }

    if (
      profile.hourlyQuota !== null &&
      !(await this.count(
        client.clientId,
        'HOUR',
        hourStart(now),
        profile.hourlyQuota,
      ))
    ) {
      return {
        allowed: false,
        refusal: 'HOURLY_QUOTA',
        retryAfterSeconds: hourlyRetryAfterSeconds(now),
      };
    }

    const dailyQuota = effectiveDailyQuota(
      profile.dailyQuota,
      client.dailyQuota,
    );
    if (
      !(await this.count(
        client.clientId,
        'DAY',
        lagosDayStart(now),
        dailyQuota,
      ))
    ) {
      return {
        allowed: false,
        refusal: 'DAILY_QUOTA',
        retryAfterSeconds: dailyRetryAfterSeconds(now),
      };
    }

    return { allowed: true };
  }

  /**
   * Takes one token from the bucket, refilled for the time since it was last
   * touched, in one statement. A bucket seen for the first time starts full.
   *
   * The clock may differ slightly between instances, so a refill is never
   * negative and the bucket's time never goes backwards.
   */
  private async takeToken(
    clientId: string,
    routeClass: string,
    perMinute: number,
    burst: number,
    now: Date,
  ): Promise<{ allowed: boolean; tokens: number }> {
    const [row] = await this.prisma.$queryRaw<
      { allowed: boolean; tokens: number }[]
    >`
      INSERT INTO api_rate_bucket AS b
        (client_id, route_class, tokens, allowed, updated_at)
      VALUES
        (${clientId}::uuid, ${routeClass}, ${burst - 1}::float8, true, ${now}::timestamptz)
      ON CONFLICT (client_id, route_class) DO UPDATE SET
        tokens = CASE
          WHEN LEAST(${burst}::float8, b.tokens + GREATEST(0, EXTRACT(EPOCH FROM (${now}::timestamptz - b.updated_at))) * ${perMinute}::float8 / 60) >= 1
          THEN LEAST(${burst}::float8, b.tokens + GREATEST(0, EXTRACT(EPOCH FROM (${now}::timestamptz - b.updated_at))) * ${perMinute}::float8 / 60) - 1
          ELSE LEAST(${burst}::float8, b.tokens + GREATEST(0, EXTRACT(EPOCH FROM (${now}::timestamptz - b.updated_at))) * ${perMinute}::float8 / 60)
        END,
        allowed =
          LEAST(${burst}::float8, b.tokens + GREATEST(0, EXTRACT(EPOCH FROM (${now}::timestamptz - b.updated_at))) * ${perMinute}::float8 / 60) >= 1,
        updated_at = GREATEST(b.updated_at, ${now}::timestamptz)
      RETURNING allowed, tokens`;
    return { allowed: row?.allowed ?? false, tokens: Number(row?.tokens ?? 0) };
  }

  /**
   * Counts one request in a window, unless the window is already full. One
   * statement, so two instances cannot both take the last place.
   */
  private async count(
    clientId: string,
    period: 'HOUR' | 'DAY',
    start: Date,
    quota: number,
  ): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO api_rate_counter AS c (client_id, period, window_start, count)
      VALUES (${clientId}::uuid, ${period}, ${start}::timestamptz, 1)
      ON CONFLICT (client_id, period, window_start) DO UPDATE
        SET count = c.count + 1
        WHERE c.count < ${quota}::int
      RETURNING count`;
    return rows.length > 0;
  }

  // --- The detection layer -----------------------------------------------------

  /**
   * Counts a check that has been answered, and pauses the organisation if
   * what it has been sending amounts to a signal.
   *
   * Only a decided check is counted: a match, a non-match, or a forged code.
   * A request refused as badly formed was never looked up.
   */
  async observe(
    client: LimitedClient,
    observation: Observation,
    requestId: string | null,
    now: Date = new Date(),
  ): Promise<AbuseSignal | null> {
    if (!isObservedOutcome(observation.resultClass)) {
      return null;
    }
    const profile = await this.profileFor(client.rateLimitProfile);
    const tally = tallyOutcome(observation.resultClass);
    const start = windowStart(now, profile.windowMinutes);

    const [window] = await this.prisma.$queryRaw<
      { checks: number; misses: number; forgeries: number }[]
    >`
      INSERT INTO api_abuse_window AS w
        (client_id, window_start, checks, misses, forgeries)
      VALUES (${client.clientId}::uuid, ${start}::timestamptz, 1, ${tally.miss}::int, ${tally.forgery}::int)
      ON CONFLICT (client_id, window_start) DO UPDATE SET
        checks = w.checks + 1,
        misses = w.misses + ${tally.miss}::int,
        forgeries = w.forgeries + ${tally.forgery}::int
      RETURNING checks, misses, forgeries`;

    const missed = tally.miss > 0;
    const freshSince = new Date(now.getTime() - profile.windowMinutes * 60_000);
    const [plateRun, codeRun] = await Promise.all([
      this.advance(client.clientId, 'PLATE', observation.plate, missed, {
        reach: profile.sequenceReach,
        freshSince,
        now,
      }),
      this.advance(client.clientId, 'CODE', observation.code, missed, {
        reach: profile.sequenceReach,
        freshSince,
        now,
      }),
    ]);

    const evidence = {
      checks: window?.checks ?? 0,
      misses: window?.misses ?? 0,
      forgeries: window?.forgeries ?? 0,
      plateRun,
      codeRun,
    };
    const signal = detectAbuse(evidence, profile);
    if (signal === null) {
      return null;
    }
    await this.pause(
      client.clientId,
      signal,
      evidence,
      profile,
      requestId,
      now,
    );
    return signal;
  }

  /**
   * Moves one kind of identifier's sequence on, under a row lock so two
   * checks at once cannot both read the old run.
   */
  private async advance(
    clientId: string,
    kind: 'PLATE' | 'CODE',
    identifier: string | null,
    missed: boolean,
    options: { reach: number; freshSince: Date; now: Date },
  ): Promise<number> {
    const position = identifier === null ? null : sequencePosition(identifier);
    if (position === null) {
      return 0;
    }
    return this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<
        { stem: string; number: bigint; run: number; updatedAt: Date }[]
      >`
        SELECT stem, number, run, updated_at AS "updatedAt"
        FROM api_sequence_state
        WHERE client_id = ${clientId}::uuid AND kind = ${kind}
        FOR UPDATE`;
      const previous: SequenceState | null = row
        ? {
            stem: row.stem,
            number: Number(row.number),
            run: row.run,
            updatedAt: row.updatedAt,
          }
        : null;
      const run = advanceSequence(previous, position, {
        missed,
        reach: options.reach,
        freshSince: options.freshSince,
      });
      await tx.$executeRaw`
        INSERT INTO api_sequence_state (client_id, kind, stem, number, run, updated_at)
        VALUES (${clientId}::uuid, ${kind}, ${position.stem}, ${BigInt(position.number)}, ${run}::int, ${options.now}::timestamptz)
        ON CONFLICT (client_id, kind) DO UPDATE SET
          stem = EXCLUDED.stem,
          number = EXCLUDED.number,
          run = EXCLUDED.run,
          updated_at = EXCLUDED.updated_at`;
      return run;
    });
  }

  /**
   * Pauses an organisation, unless it already is. The counts that raised the
   * signal start again, so it is not paused afresh the moment the pause ends
   * or is lifted. The pause is audited, with no actor: the System took it.
   */
  private async pause(
    clientId: string,
    signal: AbuseSignal,
    evidence: Record<string, number>,
    profile: RateLimitProfileValues,
    requestId: string | null,
    now: Date,
  ): Promise<void> {
    const until = pauseEnd(now, profile.pauseMinutes);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM api_client WHERE id = ${clientId}::uuid FOR UPDATE`;
      const existing = await tx.apiClientPause.findFirst({
        where: { clientId, liftedAt: null, pausedUntil: { gt: now } },
        select: { id: true },
      });
      if (existing) {
        return;
      }
      await tx.apiClientPause.create({
        data: {
          clientId,
          signal,
          pausedAt: now,
          pausedUntil: until,
          evidence,
        },
      });
      await tx.apiAbuseWindow.deleteMany({ where: { clientId } });
      await tx.apiSequenceState.deleteMany({ where: { clientId } });
      await this.audit.record(
        {
          action: 'api_client.pause',
          subjectType: 'api_client',
          subjectId: clientId,
          after: {
            signal,
            pausedUntil: until.toISOString(),
            pauseMinutes: profile.pauseMinutes,
            evidence,
          },
          requestId,
        },
        tx,
      );
    });
    this.logger.warn(
      `API client ${clientId} paused until ${until.toISOString()}: ${signal}`,
    );
  }

  /** Ends a pause early. A reason is mandatory, and the act is audited. */
  async lift(
    actor: ActorContext,
    clientId: string,
    reason: string,
    now: Date = new Date(),
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM api_client WHERE id = ${clientId}::uuid FOR UPDATE`;
      const pause = await tx.apiClientPause.findFirst({
        where: { clientId, liftedAt: null, pausedUntil: { gt: now } },
        select: { id: true, signal: true, pausedUntil: true },
      });
      if (!pause) {
        throw new ConflictException('The organisation is not paused.');
      }
      await tx.apiClientPause.update({
        where: { id: pause.id },
        data: {
          liftedAt: now,
          liftedByUserId: actor.userId,
          liftReason: reason,
        },
      });
      await this.audit.record(
        {
          action: 'api_client.pause_lift',
          subjectType: 'api_client',
          subjectId: clientId,
          actorUserId: actor.userId,
          before: {
            signal: pause.signal,
            pausedUntil: pause.pausedUntil.toISOString(),
          },
          after: { pausedUntil: null },
          reason,
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );
    });
  }

  // --- Reads -------------------------------------------------------------------

  /** The pause holding an organisation, if any. */
  async activePause(
    clientId: string,
    now: Date = new Date(),
  ): Promise<{ pausedUntil: Date } | null> {
    return this.prisma.apiClientPause.findFirst({
      where: { clientId, liftedAt: null, pausedUntil: { gt: now } },
      select: { pausedUntil: true },
      orderBy: { pausedUntil: 'desc' },
    });
  }

  /** When each paused organisation's pause ends. Absent means not paused. */
  async pausedUntil(
    clientIds: readonly string[],
    now: Date = new Date(),
  ): Promise<Map<string, Date>> {
    if (clientIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.apiClientPause.findMany({
      where: {
        clientId: { in: [...clientIds] },
        liftedAt: null,
        pausedUntil: { gt: now },
      },
      select: { clientId: true, pausedUntil: true },
    });
    const ends = new Map<string, Date>();
    for (const row of rows) {
      const known = ends.get(row.clientId);
      if (!known || known < row.pausedUntil) {
        ends.set(row.clientId, row.pausedUntil);
      }
    }
    return ends;
  }

  /**
   * The limits an organisation is held to, its use of them today, and the
   * last time it was paused.
   */
  async describe(
    client: LimitedClient,
    now: Date = new Date(),
  ): Promise<{ limits: ApiClientLimits; pause: ApiClientPause | null }> {
    const [profile, counter, last] = await Promise.all([
      this.profileFor(client.rateLimitProfile),
      this.prisma.apiRateCounter.findUnique({
        where: {
          clientId_period_windowStart: {
            clientId: client.clientId,
            period: 'DAY',
            windowStart: lagosDayStart(now),
          },
        },
        select: { count: true },
      }),
      this.prisma.apiClientPause.findFirst({
        where: { clientId: client.clientId },
        select: PAUSE_SELECT,
        orderBy: { pausedAt: 'desc' },
      }),
    ]);
    return {
      limits: {
        profile: { code: profile.code, label: profile.label },
        dailyQuota: effectiveDailyQuota(profile.dailyQuota, client.dailyQuota),
        dailyQuotaOverride: client.dailyQuota,
        usedToday: counter?.count ?? 0,
      },
      pause:
        last && isAbuseSignal(last.signal)
          ? {
              signal: last.signal,
              pausedAt: last.pausedAt.toISOString(),
              pausedUntil: (last.liftedAt ?? last.pausedUntil).toISOString(),
              active: last.liftedAt === null && last.pausedUntil > now,
            }
          : null,
    };
  }

  // --- Profiles ----------------------------------------------------------------

  async listProfiles(): Promise<RateLimitProfileSummary[]> {
    const rows = await this.prisma.rateLimitProfile.findMany({
      select: { ...PROFILE_SELECT, _count: { select: { clients: true } } },
      orderBy: { dailyQuota: 'asc' },
    });
    return rows.map((row) => this.toSummary(row, row._count.clients));
  }

  /** A profile an organisation can be given, or 404. */
  async requireProfile(
    code: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<{ code: string; label: string }> {
    const row = await tx.rateLimitProfile.findUnique({
      where: { code },
      select: { code: true, label: true },
    });
    if (!row) {
      throw new NotFoundException();
    }
    return row;
  }

  async createProfile(
    actor: ActorContext,
    input: CreateRateLimitProfileInput,
  ): Promise<RateLimitProfileSummary> {
    const { code, label, description, ...numbers } = input;
    await this.prisma.$transaction(async (tx) => {
      const taken = await tx.rateLimitProfile.findUnique({
        where: { code },
        select: { code: true },
      });
      if (taken) {
        throw new ConflictException('A limit profile with that code exists.');
      }
      await tx.rateLimitProfile.create({
        data: { code, label, description: description || null, ...numbers },
      });
      await this.audit.record(
        {
          action: 'rate_limit_profile.create',
          subjectType: 'rate_limit_profile',
          actorUserId: actor.userId,
          after: { code, label, ...numbers },
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );
    });
    return this.getProfile(code);
  }

  /**
   * Replaces every number in a profile. It applies to the next request of
   * each organisation holding it.
   */
  async updateProfile(
    actor: ActorContext,
    code: string,
    input: UpdateRateLimitProfileInput,
  ): Promise<RateLimitProfileSummary> {
    const { reason, label, description, ...numbers } = input;
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT code FROM rate_limit_profile WHERE code = ${code} FOR UPDATE`;
      const before = await tx.rateLimitProfile.findUnique({
        where: { code },
        select: PROFILE_SELECT,
      });
      if (!before) {
        throw new NotFoundException();
      }
      await tx.rateLimitProfile.update({
        where: { code },
        data: { label, description: description || null, ...numbers },
      });
      await this.audit.record(
        {
          action: 'rate_limit_profile.update',
          subjectType: 'rate_limit_profile',
          actorUserId: actor.userId,
          before: { code, label: before.label, ...values(before) },
          after: { code, label, ...numbers },
          reason,
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );
    });
    return this.getProfile(code);
  }

  private async getProfile(code: string): Promise<RateLimitProfileSummary> {
    const row = await this.prisma.rateLimitProfile.findUnique({
      where: { code },
      select: { ...PROFILE_SELECT, _count: { select: { clients: true } } },
    });
    if (!row) {
      throw new NotFoundException();
    }
    return this.toSummary(row, row._count.clients);
  }

  /**
   * The profile in force. The column's foreign key means an organisation
   * always names one that exists; its absence is a fault, not a reason to
   * let a request through unlimited.
   */
  private async profileFor(code: string): Promise<ProfileRow> {
    const row = await this.prisma.rateLimitProfile.findUnique({
      where: { code },
      select: PROFILE_SELECT,
    });
    if (!row) {
      throw new Error(`Rate-limit profile ${code} does not exist.`);
    }
    return row;
  }

  private toSummary(
    row: ProfileRow,
    clientCount: number,
  ): RateLimitProfileSummary {
    return {
      code: row.code,
      label: row.label,
      description: row.description,
      ...values(row),
      clientCount,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // --- Housekeeping ------------------------------------------------------------

  /**
   * Deletes counters and detection state whose window has passed. A day's
   * margin is kept, so today's use can always be read.
   */
  async prune(now: Date = new Date()): Promise<void> {
    const cutoff = new Date(now.getTime() - 2 * DAY_MS);
    await this.prisma.$transaction([
      this.prisma.apiRateCounter.deleteMany({
        where: { windowStart: { lt: cutoff } },
      }),
      this.prisma.apiAbuseWindow.deleteMany({
        where: { windowStart: { lt: cutoff } },
      }),
      this.prisma.apiSequenceState.deleteMany({
        where: { updatedAt: { lt: cutoff } },
      }),
    ]);
  }
}
