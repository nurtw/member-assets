import { HttpStatus } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

/**
 * The single error shape for the whole API.
 *
 * Both the exception filter and the terminal not-found handler build responses
 * here. That is deliberate: if an unmatched route answered in a different shape
 * from a matched route that found nothing, the shape itself would tell a caller
 * which routes exist. PRD Requirement 14.3 forbids exactly that inference.
 */
export interface ErrorResponse {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly requestId: string;
  };
}

/** Messages returned to callers. Deliberately uninformative. */
const GENERIC_MESSAGES: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'The request could not be processed.',
  [HttpStatus.UNAUTHORIZED]: 'Authentication is required.',
  [HttpStatus.FORBIDDEN]: 'This request is not permitted.',
  [HttpStatus.NOT_FOUND]: 'No matching resource was found.',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Rate limit exceeded.',
};

const FALLBACK_MESSAGE = 'The request could not be processed.';

/** Longest caller-supplied request id accepted before one is minted instead. */
const MAX_REQUEST_ID_LENGTH = 200;

/**
 * Honours a caller-supplied `X-Request-ID` where it is present and sane, and
 * mints one otherwise, so every failure remains traceable to a log line even
 * when the client omits it.
 */
export function resolveRequestId(supplied: string | undefined): string {
  if (
    typeof supplied === 'string' &&
    supplied.length > 0 &&
    supplied.length <= MAX_REQUEST_ID_LENGTH
  ) {
    return supplied;
  }
  return randomUUID();
}

export function buildErrorResponse(
  status: number,
  requestId: string,
): ErrorResponse {
  return {
    error: {
      code: HttpStatus[status] ?? 'ERROR',
      message: GENERIC_MESSAGES[status] ?? FALLBACK_MESSAGE,
      requestId,
    },
  };
}
