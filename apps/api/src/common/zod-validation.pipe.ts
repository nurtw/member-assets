import {
  ArgumentMetadata,
  HttpException,
  HttpStatus,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import type { ZodType } from 'zod';

import type { ValidationIssue } from './error-response.js';

/**
 * Carries field-level failures through to the exception filter.
 *
 * A distinct class rather than a flag on `BadRequestException`, so the filter
 * can be explicit about the one case in which it returns anything beyond the
 * generic message. Every other 400 stays uninformative.
 */
export class ValidationException extends HttpException {
  override readonly name = 'ValidationException';

  constructor(readonly issues: readonly ValidationIssue[]) {
    super('Validation failed', HttpStatus.BAD_REQUEST);
  }
}

/**
 * Validates a request body against a schema from `@nurtw/contracts`.
 *
 * The parsed value replaces the raw body, so a handler receives the trimmed,
 * coerced, **stripped** object rather than what arrived on the wire. Stripping is
 * the security-relevant half: zod objects discard unknown keys by default, so a
 * caller cannot smuggle `isActive`, `path`, or `level` into a route that never
 * meant to accept them and have it reach a Prisma write through a spread.
 *
 * Applied per route with `@Body(new ZodValidationPipe(schema))` rather than
 * globally. A global pipe would need a schema registry keyed by DTO class, and
 * this codebase has no DTO classes by design — the schemas are shared with the
 * web application, which cannot import NestJS decorators.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new ValidationException(
        result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }

    return result.data;
  }
}
