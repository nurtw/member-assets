import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { buildErrorResponse, resolveRequestId } from './error-response.js';
import { ValidationException } from './zod-validation.pipe.js';

/**
 * Turns every exception raised inside the Nest pipeline into the shared generic
 * error shape.
 *
 * Note this filter does NOT see requests that match no route at all — in Express
 * those never enter the Nest pipeline. Those are handled by the terminal
 * not-found handler registered in `main.ts`, which builds its response from the
 * same helper so the two are indistinguishable.
 *
 * PRD Requirement 14.3 — a caller must not be able to tell "no such route" from
 * "no such record" from "not permitted to see that record", because the
 * differences between those answers are themselves the record set.
 *
 * PRD §17 — the full error is logged server-side against a request id; the
 * caller receives the id and nothing else, so support can correlate the two
 * without the response ever carrying detail.
 *
 * The single exception is a rejected request body, whose field-level failures
 * are returned. Those describe the request the caller has just sent and disclose
 * nothing about the record set, so Requirement 14.3 is untouched — see
 * `ValidationException`.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const requestId = resolveRequestId(request.header('x-request-id'));

    const detail =
      exception instanceof Error
        ? (exception.stack ?? exception.message)
        : String(exception);

    // Server-side only. Never returned to the caller.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status} [${requestId}]`,
        detail,
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} -> ${status} [${requestId}]`,
      );
    }

    const details =
      exception instanceof ValidationException ? exception.issues : undefined;

    response.status(status).json(buildErrorResponse(status, requestId, details));
  }
}
