import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  declareVehicleSchema,
  dismissDisputeSchema,
  setDeclarationStatusSchema,
  updateVehicleSchema,
  type DeclareVehicleInput,
  type DismissDisputeInput,
  type SetDeclarationStatusInput,
  type UpdateVehicleInput,
} from '@nurtw/contracts';

import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Documented } from '../docs/documented.decorator.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import { VehicleService } from './vehicle.service.js';

/**
 * Vehicle declaration (PRD §9).
 *
 * `@RequirePermission` is the coarse gate; the service re-asks against the
 * declaration's own organisation path (or, on create, the declaring branch
 * or unit's path). Both are needed — without the decorator the guard
 * refuses by default, and without the service check an officer scoped to
 * one branch could act on another branch's declarations.
 */
@Controller('vehicles')
export class VehicleController {
  constructor(private readonly vehicles: VehicleService) {}

  @RequirePermission('vehicle.read')
  @Get()
  @Documented({
    summary: 'List vehicle declarations.',
    description:
      'Filtered to the organisation subtrees in which the caller holds `vehicle.read`, not ' +
      'merely ordered by them. Carries no chassis or VIN data — PRD Requirement 9.4 keeps that ' +
      'restricted, and a list is where an over-generous projection would disclose the most at ' +
      'once.',
    query: [
      { name: 'status', description: 'Filter by declaration status.' },
      { name: 'organisationId', description: 'Filter to one branch or unit.' },
    ],
  })
  async list(
    @Req() request: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('organisationId') organisationId?: string,
  ) {
    const actor = this.actor(request);
    return {
      vehicles: await this.vehicles.list(actor.userId, {
        status,
        organisationId,
      }),
    };
  }

  @RequirePermission('vehicle.read')
  @Get(':id')
  @Documented({
    summary: 'Retrieve one declaration in full.',
    description:
      'Chassis and VIN are present only for a caller holding `vehicle.read_restricted` (PRD ' +
      'Requirement 9.4) — otherwise the field is absent from the response, not merely blank. ' +
      'A declaration outside the caller’s scope answers 404, identically to one that does ' +
      'not exist, so identifiers cannot be enumerated.',
    responses: {
      404: 'No such declaration, or it lies outside the caller’s scope.',
    },
  })
  async findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const actor = this.actor(request);
    return { vehicle: await this.vehicles.findOne(actor.userId, id) };
  }

  @RequirePermission('vehicle.declare')
  @Post()
  @Documented({
    summary: 'Declare a vehicle.',
    description:
      'PRD Requirement 9.5 — a manual, deliberate act. `vehicle.declare` is seeded into the ' +
      'super administrator bundle alone; every other holder reaches it only by express grant. ' +
      'A plate already carrying an `ACTIVE` declaration is not silently merged or rejected: the ' +
      'new declaration is recorded as `DISPUTED` and both are preserved (PRD §23.9). ' +
      'Authorised against the declaring branch or unit’s path.',
    body: declareVehicleSchema,
    responses: {
      403: 'The caller may not declare into that organisation.',
      404: 'No such organisation.',
      409: 'The organisation is inactive, or is a council or zone rather than a branch or unit.',
    },
  })
  async declare(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(declareVehicleSchema))
    body: DeclareVehicleInput,
  ) {
    const actor = this.actor(request);
    return { vehicle: await this.vehicles.declare(actor, body) };
  }

  @RequirePermission('vehicle.update')
  @Patch(':id')
  @Documented({
    summary: 'Amend a declaration’s record-keeping fields.',
    description:
      'Never changes `status` — see the status route, a distinct, separately-audited act. ' +
      'Moving a declaration to a different branch or unit requires `vehicle.update` at both the ' +
      'current and destination organisation’s path.',
    body: updateVehicleSchema,
    responses: {
      403: 'The caller may not amend this declaration, or may not move it to that organisation.',
      404: 'No such declaration, or destination organisation.',
    },
  })
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateVehicleSchema)) body: UpdateVehicleInput,
  ) {
    const actor = this.actor(request);
    return { vehicle: await this.vehicles.update(actor, id, body) };
  }

  @RequirePermission('vehicle.suspend')
  @Patch(':id/status')
  @Documented({
    summary: 'Move a declaration between ACTIVE, SUSPENDED, and RETIRED.',
    description:
      'A reason is always required. Cannot reach or leave `DISPUTED` or `ARCHIVED` through this ' +
      'route — those are `declare`’s and the dispute-dismissal route’s concern ' +
      'respectively, each held to a different permission because a route decorator names one ' +
      'permission and the guard refuses before the service is reached.',
    body: setDeclarationStatusSchema,
    responses: {
      404: 'No such declaration, or it lies outside the caller’s scope.',
      409: 'Not a legal transition from the declaration’s current status.',
    },
  })
  async setStatus(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setDeclarationStatusSchema))
    body: SetDeclarationStatusInput,
  ) {
    const actor = this.actor(request);
    return { vehicle: await this.vehicles.setStatus(actor, id, body) };
  }

  @RequirePermission('vehicle.resolve_dispute')
  @Post(':id/dismiss-dispute')
  @Documented({
    summary: 'Dismiss a disputed declaration.',
    description:
      'Moves a `DISPUTED` declaration to `ARCHIVED`. The only dispute-resolution outcome this ' +
      'System builds: *upholding* a disputed claim would require demoting whichever declaration ' +
      'currently holds `ACTIVE` for that plate, a policy decision QUESTIONS.md VEH-07 leaves ' +
      'open. Held to its own permission rather than the general status route, since almost no ' +
      'holder of `vehicle.suspend` also holds this.',
    body: dismissDisputeSchema,
    responses: {
      404: 'No such declaration, or it lies outside the caller’s scope.',
      409: 'The declaration is not currently DISPUTED.',
    },
  })
  async dismissDispute(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(dismissDisputeSchema))
    body: DismissDisputeInput,
  ) {
    const actor = this.actor(request);
    return { vehicle: await this.vehicles.dismissDispute(actor, id, body) };
  }

  private actor(request: AuthenticatedRequest): ActorContext {
    if (!request.user) {
      throw new BadRequestException();
    }
    return {
      userId: request.user.id,
      requestId: request.header('x-request-id') ?? null,
      ipAddress: request.ip ?? null,
    };
  }
}
