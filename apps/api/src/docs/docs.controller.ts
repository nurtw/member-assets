import { Controller, Get, Header } from '@nestjs/common';

import { READ_INTERNAL_DOCS_PERMISSION } from '@nurtw/contracts';

import {
  Public,
  RequirePermission,
} from '../auth/require-permission.decorator.js';
import { Documented } from './documented.decorator.js';
import { OpenApiService } from './openapi.service.js';

/**
 * The API reference, in two parts (item 54).
 *
 * - **The whole of it** is an accurate map of every route and the permission
 *   each one requires, which is exactly what an attacker would otherwise have
 *   to infer by probing. It goes only to a holder of `docs.read_internal`:
 *   the super administrator, by the owner's direction of 19 October 2026, and
 *   whoever they grant it to. The public docs page shows it to them.
 * - **The integration reference** is public: the routes an approved outside
 *   organisation calls, those that name a scope, and nothing else. The public
 *   docs page is built on it.
 *
 * The whole document is also committed to `docs/reference/openapi.json`.
 */
@Controller('docs')
export class DocsController {
  constructor(private readonly openApi: OpenApiService) {}

  @RequirePermission(READ_INTERNAL_DOCS_PERMISSION)
  @Get('openapi.json')
  @Documented({
    summary: 'Retrieve the OpenAPI 3.1 description of this API.',
    description:
      'Every route, and what it requires. Generated from the running application rather ' +
      'than maintained by hand, so it cannot describe a route that does not exist.',
  })
  document(): Record<string, unknown> {
    return this.openApi.getDocument();
  }

  @Public()
  @Get('integration.json')
  @Header('Cache-Control', 'public, max-age=300')
  @Documented({
    summary: 'Retrieve the OpenAPI 3.1 description of the verification API.',
    description:
      'The routes an approved outside organisation calls, each named with the scope it ' +
      'needs, and nothing else. The public docs page is built on it.',
  })
  integration(): Record<string, unknown> {
    return this.openApi.getIntegrationDocument();
  }
}
