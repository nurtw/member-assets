import { SetMetadata } from '@nestjs/common';
import type { ZodType } from 'zod';

export const DOCUMENTED_METADATA_KEY = 'nurtw:documented';

export interface RouteDocumentation {
  /** One line, imperative. Appears as the OpenAPI `summary`. */
  summary: string;
  /** Optional prose: the rule the route enforces, and why it exists. */
  description?: string;
  /** The zod schema the route validates its body against, where it has one. */
  body?: ZodType;
  /** Query parameters, named and described. */
  query?: { name: string; description: string; required?: boolean }[];
  /** Documented non-success outcomes, as status code to explanation. */
  responses?: Record<number, string>;
}

/**
 * Attaches reference documentation to a route handler.
 *
 * Placed on the handler rather than held in a separate registry so that
 * documentation moves with the code it describes. A registry keyed by path is
 * the standard way API documentation comes to describe endpoints that were
 * renamed two releases ago.
 *
 * The generator reads the *actual* Nest router, so a documented route that no
 * longer exists cannot appear in the specification, and `openapi.spec.ts` fails
 * the build when a route exists that carries no documentation. Between them, the
 * specification cannot drift from the implementation in either direction.
 */
export const Documented = (documentation: RouteDocumentation) =>
  SetMetadata(DOCUMENTED_METADATA_KEY, documentation);
