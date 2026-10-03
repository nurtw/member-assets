import {
  HttpException,
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { catchError, from, mergeMap, throwError, type Observable } from 'rxjs';

import {
  SCOPE_METADATA_KEY,
  type ExternalRequest,
} from '../auth/require-scope.decorator.js';
import { resolveRequestId } from '../common/error-response.js';
import {
  ApiRequestLogService,
  type ApiRequestLogEntry,
} from './api-request-log.service.js';

/**
 * One `api_request_log` row for every external request that passed the guard
 * (PRD §17, §24 `api_request` — item 12). A request the guard refused is
 * logged by `ApiClientAuthService` instead, so each request is logged once.
 *
 * It wraps the route's pipes as well as its handler, so a body that fails
 * validation is logged too, as `INVALID_REQUEST`. The row is written before
 * the response leaves, so it exists by the time the caller has its answer.
 *
 * A failure to write the row is logged and does not fail the request: the
 * check itself is in the audit trail, written before the answer was built.
 */
@Injectable()
export class ExternalRequestLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ExternalRequestLogInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly requests: ApiRequestLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<ExternalRequest>();
    const supplied = request.headers['x-request-id'];
    const route = (request.route as { path?: string } | undefined)?.path;
    const success =
      this.reflector.get<number | undefined>(
        HTTP_CODE_METADATA,
        context.getHandler(),
      ) ?? (request.method === 'POST' ? 201 : 200);

    const entry = (
      resultClass: string,
      statusCode: number,
    ): ApiRequestLogEntry => ({
      requestId: resolveRequestId(
        Array.isArray(supplied) ? supplied[0] : supplied,
      ),
      // The route pattern, never the URL: a query string is not logged.
      endpoint: `${request.method} ${route ?? request.path}`,
      scope:
        this.reflector.getAllAndOverride<string | undefined>(
          SCOPE_METADATA_KEY,
          [context.getHandler(), context.getClass()],
        ) ?? null,
      resultClass,
      statusCode,
      clientId: request.apiClient?.clientId ?? null,
      tokenId: request.apiClient?.tokenId ?? null,
      ipAddress: request.ip ?? null,
      identifierScheme: request.externalOutcome?.identifierScheme ?? null,
    });

    return next.handle().pipe(
      mergeMap(async (body: unknown) => {
        await this.write(
          entry(request.externalOutcome?.resultClass ?? 'OK', success),
        );
        return body;
      }),
      // An error from the pipes or the handler is logged, then passed on
      // untouched to the exception filter.
      catchError((error: unknown) => {
        const statusCode =
          error instanceof HttpException ? error.getStatus() : 500;
        return from(this.write(entry(classOf(statusCode), statusCode))).pipe(
          mergeMap(() => throwError(() => error)),
        );
      }),
    );
  }

  private async write(entry: ApiRequestLogEntry): Promise<void> {
    try {
      await this.requests.record(entry);
    } catch (error) {
      this.logger.error(
        `External request ${entry.requestId} not logged: ${String(error)}`,
      );
    }
  }
}

function classOf(statusCode: number): string {
  if (statusCode === 400) {
    return 'INVALID_REQUEST';
  }
  if (statusCode === 503) {
    return 'UNAVAILABLE';
  }
  return statusCode >= 500 ? 'ERROR' : `HTTP_${statusCode}`;
}
