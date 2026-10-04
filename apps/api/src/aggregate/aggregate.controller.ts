import {
  Controller,
  Get,
  Query,
  Req,
  UnauthorizedException,
  UseInterceptors,
} from '@nestjs/common';
import {
  aggregateTotalQuerySchema,
  aggregateVehicleQuerySchema,
  type AggregateVehicleQuery,
  type AggregateVehicleResponse,
  type OrganisationMetadataResponse,
} from '@nurtw/contracts';

import { ExternalRequestLogInterceptor } from '../api-client/external-request-log.interceptor.js';
import {
  RequireScope,
  type AuthenticatedApiClient,
  type ExternalRequest,
} from '../auth/require-scope.decorator.js';
import { resolveRequestId } from '../common/error-response.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Documented } from '../docs/documented.decorator.js';
import {
  AggregateService,
  type AggregateRequestMeta,
  type AggregateResult,
} from './aggregate.service.js';

const COUNTED =
  'Counts the vehicles the Union admits to an external total (PRD Requirement 13.5); a ' +
  'vehicle merely on record is never counted. The answer names no vehicle and says nothing ' +
  'of declaration, payment, or dues (Requirement 12.7).';

/**
 * Vehicle totals for outside organisations (PRD §13 — item 14). Reached by
 * API token only, under the slower aggregate rate (item 13).
 *
 * Two routes, one per tier: a route names exactly one scope (Decision 9.10),
 * and PRD §13.2 makes the tiers separate scopes. The grand total is therefore
 * at `/aggregates/vehicles/total`, beside the filtered `/aggregates/vehicles`.
 */
@Controller('aggregates/vehicles')
@UseInterceptors(ExternalRequestLogInterceptor)
export class AggregateController {
  constructor(private readonly aggregates: AggregateService) {}

  @RequireScope('aggregate:vehicles:total')
  @Get('total')
  @Documented({
    summary: 'Read the total number of NURTW vehicles.',
    description:
      `The unfiltered total, now, exact. ${COUNTED} Any query parameter is refused as a ` +
      'request error, never ignored (PRD Requirement 13.2).',
    responses: { 400: 'A query parameter was sent.' },
  })
  async total(
    @Req() request: ExternalRequest,
    @Query(new ZodValidationPipe(aggregateTotalQuerySchema)) _query: object,
  ): Promise<AggregateVehicleResponse> {
    return this.send(
      request,
      await this.aggregates.grandTotal(this.client(request), meta(request)),
    );
  }

  @RequireScope('aggregate:vehicles:read')
  @Get()
  @Documented({
    summary: 'Read a total number of NURTW vehicles under approved filters.',
    description:
      `${COUNTED} Filters: a zone or a branch (not both), a vehicle category, and a ` +
      'reporting period, each named as `GET /metadata/organisation` names it. Any other ' +
      'parameter is refused (Requirement 13.1). A total below the floor (25) answers ' +
      '`SUPPRESSED`; any other is rounded to the nearest `rounded_to_nearest` (10), so one ' +
      'total cannot be subtracted from another to uncover a small one. A period is counted ' +
      'as at its end, in Lagos, or now if it has not ended.',
    query: [
      { name: 'zone_id', description: 'A zone’s id.' },
      { name: 'branch_id', description: 'A branch’s id. Not with `zone_id`.' },
      { name: 'vehicle_category', description: 'A vehicle category’s code.' },
      {
        name: 'period',
        description:
          'A month (`2026-09`), a quarter (`2026-Q3`), or a year (`2026`) that has begun.',
      },
    ],
    responses: {
      400: 'A parameter that is not an approved filter, or a filter naming nothing in the metadata.',
    },
  })
  async filtered(
    @Req() request: ExternalRequest,
    @Query(new ZodValidationPipe(aggregateVehicleQuerySchema))
    query: AggregateVehicleQuery,
  ): Promise<AggregateVehicleResponse> {
    return this.send(
      request,
      await this.aggregates.filtered(
        this.client(request),
        query,
        meta(request),
      ),
    );
  }

  private send<T>(request: ExternalRequest, result: AggregateResult<T>): T {
    request.externalOutcome = result.outcome;
    return result.response;
  }

  /** Set by the guard on every scope route; its absence is a wiring fault. */
  private client(request: ExternalRequest): AuthenticatedApiClient {
    if (!request.apiClient) {
      throw new UnauthorizedException();
    }
    return request.apiClient;
  }
}

/**
 * The labels an organisation needs to name a filter and read an answer
 * (proposal §12.2 — item 14).
 */
@Controller('metadata')
@UseInterceptors(ExternalRequestLogInterceptor)
export class OrganisationMetadataController {
  constructor(private readonly aggregates: AggregateService) {}

  @RequireScope('organization:metadata:read')
  @Get('organisation')
  @Documented({
    summary: 'Read the zones, branches, and vehicle categories.',
    description:
      'The ids and names a filter on `GET /aggregates/vehicles` uses, and the labels of the ' +
      'categories a response may carry. Active entries only. The Union’s structure, never a ' +
      'member or a vehicle.',
  })
  async organisation(
    @Req() request: ExternalRequest,
  ): Promise<OrganisationMetadataResponse> {
    const result = await this.aggregates.metadata(meta(request));
    request.externalOutcome = result.outcome;
    return result.response;
  }
}

function meta(request: ExternalRequest): AggregateRequestMeta {
  const supplied = request.headers['x-request-id'];
  return {
    requestId: resolveRequestId(
      Array.isArray(supplied) ? supplied[0] : supplied,
    ),
    ipAddress: request.ip,
  };
}
