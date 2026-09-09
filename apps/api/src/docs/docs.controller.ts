import { Controller, Get } from '@nestjs/common';

import { RequirePermission } from '../auth/require-permission.decorator.js';
import { Documented } from './documented.decorator.js';
import { OpenApiService } from './openapi.service.js';

/**
 * The API reference, served to authenticated internal users.
 *
 * Not public. The specification is an accurate map of every route and the
 * permission each one requires, which is exactly what an attacker would
 * otherwise have to infer by probing. `organisation.read` is the lowest bar an
 * internal role holds, so this is "any Union officer", not "anyone".
 *
 * The same document is committed to `docs/reference/openapi.json` for readers
 * without an account — external integrators receive that file, and the
 * integration guide, rather than credentials to this endpoint.
 */
@Controller('docs')
export class DocsController {
  constructor(private readonly openApi: OpenApiService) {}

  @RequirePermission('organisation.read')
  @Get('openapi.json')
  @Documented({
    summary: 'Retrieve the OpenAPI 3.1 description of this API.',
    description:
      'Generated from the running application rather than maintained by hand, so it ' +
      'cannot describe a route that does not exist.',
  })
  document(): Record<string, unknown> {
    return this.openApi.getDocument();
  }
}
