import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { IdentifierScheme } from '@prisma/client';

import { HousekeepingService } from '../housekeeping/housekeeping.service.js';
import { purgeInBatches } from '../housekeeping/purge.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';

/** PRD §23.15: API request logs are kept 12 months. The period is a setting. */
export const API_REQUEST_LOG_RETENTION_MONTHS = 'retention.api_request_log_months';
const DEFAULT_RETENTION_MONTHS = 12;

/**
 * Why an external request was refused before it reached a route. The caller
 * is told none of this (ARCHITECTURE.md Decision 5.4): it receives the generic
 * 401 or 403, and the distinction is kept here.
 */
export const API_DENIALS = [
  'NO_TOKEN',
  'MALFORMED_TOKEN',
  'UNKNOWN_TOKEN',
  'TOKEN_REVOKED',
  'TOKEN_REPLACED',
  'TOKEN_EXPIRED',
  'CLIENT_NOT_ACTIVE',
  'ADDRESS_NOT_ALLOWED',
  'SCOPE_DENIED',
] as const;

export type ApiDenial = (typeof API_DENIALS)[number];

export interface ApiRequestLogEntry {
  requestId: string;
  /** Proposal §14.3 — the id the System gave the request. */
  serverRequestId?: string | null;
  /** The method and the route pattern. Never a query string. */
  endpoint: string;
  scope: string | null;
  /** A denial above, or the outcome a route reports (item 12). */
  resultClass: string;
  statusCode: number;
  clientId?: string | null;
  tokenId?: string | null;
  ipAddress?: string | null;
  rateLimited?: boolean;
  identifierScheme?: IdentifierScheme | null;
}

/**
 * The external access log (PRD §17, §24 `api_request`; retained 12 months per
 * §23.15).
 *
 * One row per external request: the client, the token's id, the endpoint, the
 * outcome, and the status. **Never the token**, and never an identifier that
 * was looked up. Requirement 12.2 forbids the first, and the second would turn
 * the log into a copy of what each organisation asked about.
 */
@Injectable()
export class ApiRequestLogService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly housekeeping: HousekeepingService,
  ) {}

  onModuleInit(): void {
    // Purged with the other housekeeping. Suites call `prune()` themselves.
    this.housekeeping.register('api-request-log.retention', () => this.prune());
  }

  /**
   * Deletes log rows older than the retention period (PRD §23.15), in
   * batches. Returns how many it removed.
   */
  async prune(now: Date = new Date()): Promise<number> {
    const months = await this.settings.getPositiveInteger(
      API_REQUEST_LOG_RETENTION_MONTHS,
      DEFAULT_RETENTION_MONTHS,
    );
    const cutoff = new Date(now);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
    return purgeInBatches(
      (take) =>
        this.prisma.apiRequestLog.findMany({
          where: { createdAt: { lt: cutoff } },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
          take,
        }),
      (ids) =>
        this.prisma.apiRequestLog.deleteMany({ where: { id: { in: ids } } }),
    );
  }

  async record(entry: ApiRequestLogEntry): Promise<void> {
    await this.prisma.apiRequestLog.create({
      data: {
        requestId: entry.requestId,
        serverRequestId: entry.serverRequestId ?? null,
        endpoint: entry.endpoint,
        scope: entry.scope,
        resultClass: entry.resultClass,
        statusCode: entry.statusCode,
        clientId: entry.clientId ?? null,
        tokenId: entry.tokenId ?? null,
        ipAddress: entry.ipAddress ?? null,
        rateLimited: entry.rateLimited ?? false,
        identifierScheme: entry.identifierScheme ?? null,
      },
    });
  }
}
