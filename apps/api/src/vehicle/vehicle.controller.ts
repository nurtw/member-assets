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
  declareRecordedVehicleSchema,
  declareVehicleSchema,
  dismissDisputeSchema,
  recordVehicleSchema,
  setDeclarationStatusSchema,
  undeclareVehicleSchema,
  updateVehicleSchema,
  type DeclareRecordedVehicleInput,
  type DeclareVehicleInput,
  type DismissDisputeInput,
  type RecordVehicleInput,
  type SetDeclarationStatusInput,
  type UndeclareVehicleInput,
  type UpdateVehicleInput,
} from '@nurtw/contracts';

import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Documented } from '../docs/documented.decorator.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import { VehicleService } from './vehicle.service.js';

/**
 * Vehicle records and declarations (PRD §9, revision 1.3 Requirements 9.7–9.9).
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
      'merely ordered by them. Carries no chassis or VIN data and no owner details — PRD ' +
      'Requirements 9.4 and 9.8 keep those restricted, and a list is where an over-generous ' +
      'projection would disclose the most at once. Vehicles on record (not yet declared) are ' +
      'listed after declared ones.',
    query: [
      { name: 'status', description: 'Filter by declaration status.' },
      { name: 'organisationId', description: 'Filter to one branch or unit.' },
      { name: 'q', description: 'Matches the plate number, normalised the same way it is stored.' },
      {
        name: 'memberId',
        description:
          'Only vehicles driven by this member (or pending applicant). Still limited to the caller’s scope.',
      },
    ],
  })
  async list(
    @Req() request: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('organisationId') organisationId?: string,
    @Query('q') q?: string,
    @Query('memberId', new ParseUUIDPipe({ optional: true }))
    memberId?: string,
  ) {
    const actor = this.actor(request);
    return {
      vehicles: await this.vehicles.list(actor.userId, {
        status,
        organisationId,
        q,
        memberId,
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
      'Owner details (Requirement 9.8) appear here and on no list or verification response. ' +
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
      'A plate already ON RECORD is declared in place — the same record, not a second one ' +
      '(ARCHITECTURE.md Decision 6.5). Authorised against the declaring branch or unit’s path, ' +
      'and, for a record being declared in place, against where that record currently sits.',
    body: declareVehicleSchema,
    responses: {
      400: 'The route type is not one of the listed route types.',
      403: 'The caller may not declare into that organisation.',
      404: 'No such organisation, or no such member (`declaredByMemberId`).',
      409: 'The organisation is inactive or not a branch or unit, or the plate is on record outside the caller’s area.',
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

  @RequirePermission('vehicle.record')
  @Post('record')
  @Documented({
    summary: 'Record a vehicle on record (not a declaration).',
    description:
      'PRD Requirement 9.7 (revision 1.3). Creates an `ON_RECORD` vehicle: neither declared nor ' +
      'onboarded, and counted by nothing external until both happen. Route type and the ' +
      'owner’s name and phone are required (Requirements 9.8–9.9). A plate that already has a ' +
      'standing record is refused — recording adds vehicles, it does not claim them; a claim is ' +
      'a declaration. The refusal does not say where that record is. `declaredByMemberId` may ' +
      'name an applicant whose application is still pending (Requirement 9.10).',
    body: recordVehicleSchema,
    responses: {
      400: 'The body failed validation, or the route type is not one of the listed route types.',
      403: 'The caller may not record into that organisation.',
      404: 'No such organisation, or no such member (`declaredByMemberId`).',
      409: 'The organisation is inactive or not a branch or unit, or a record for this plate already exists.',
    },
  })
  async record(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(recordVehicleSchema))
    body: RecordVehicleInput,
  ) {
    const actor = this.actor(request);
    return { vehicle: await this.vehicles.record(actor, body) };
  }

  @RequirePermission('vehicle.declare')
  @Post(':id/declare')
  @Documented({
    summary: 'Declare a vehicle that is on record.',
    description:
      'ARCHITECTURE.md Decision 6.6, revision 1.20 (VEH-38). Declares this vehicle in place, ' +
      'from any status but retired or archived, once. Nothing is required: a route type, an ' +
      'owner, and a chassis number are optional. A vehicle on record becomes `ACTIVE`; a ' +
      'suspended or disputed one keeps its status. `organisationId` moves the record as it is ' +
      'declared, and then `vehicle.declare` is required at both the current and the ' +
      'destination organisation.',
    body: declareRecordedVehicleSchema,
    responses: {
      403: 'The caller may not declare here, or may not move the record to that organisation.',
      404: 'No such vehicle, or it lies outside the caller’s scope.',
      409: 'The vehicle is already declared or has left the register, or the plate already has an active declaration.',
    },
  })
  async declareRecorded(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(declareRecordedVehicleSchema))
    body: DeclareRecordedVehicleInput,
  ) {
    const actor = this.actor(request);
    return { vehicle: await this.vehicles.declareRecorded(actor, id, body) };
  }

  @RequirePermission('vehicle.declare')
  @Post(':id/undeclare')
  @Documented({
    summary: 'Undeclare a declared vehicle.',
    description:
      'Item 60, VEH-39. Stops the vehicle counting in the external total and changes nothing ' +
      'else: an `ACTIVE` vehicle returns to `ON_RECORD`, a suspended or disputed one keeps its ' +
      'status, its sticker still verifies, and its history is kept. A reason is required. ' +
      'Declaring it again stamps a new declared date, so it counts only from then. Never a ' +
      'delete. `vehicle.declare` is held by the super administrator alone (VEH-43).',
    body: undeclareVehicleSchema,
    responses: {
      403: 'The caller may not undeclare vehicles here.',
      404: 'No such vehicle, or it lies outside the caller’s scope.',
      409: 'The vehicle is not declared, or has left the register.',
    },
  })
  async undeclare(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(undeclareVehicleSchema))
    body: UndeclareVehicleInput,
  ) {
    const actor = this.actor(request);
    return { vehicle: await this.vehicles.undeclare(actor, id, body) };
  }

  @RequirePermission('vehicle.update')
  @Patch(':id')
  @Documented({
    summary: 'Amend a declaration’s record-keeping fields.',
    description:
      'Never changes `status` — see the status route, a distinct, separately-audited act. ' +
      'Moving a declaration to a different branch or unit requires `vehicle.update` at both the ' +
      'current and destination organisation’s path. `declaredByMemberId` attaches, changes, or ' +
      '(sent as `null`) clears the member the vehicle is associated with — the route a migrated ' +
      'or previously unit-only declaration is reconciled to an operator through. On an imported ' +
      'vehicle (item 62), a holder of `vehicle.update_imported` amends at any time and anyone else once: ' +
      'the next save answers 409, and one edit may not change the plate, branch or unit, or linked member (403).',
    body: updateVehicleSchema,
    responses: {
      403: 'The caller may not amend this declaration, or may not move it to that organisation.',
      404: 'No such declaration, destination organisation, or member (`declaredByMemberId`).',
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

  @RequirePermission('vehicle.record')
  @Patch(':id/imported')
  @Documented({
    summary: 'A field enumerator’s one edit of an imported vehicle.',
    description:
      'Item 62 (VEH-40). The same amendment as `PATCH /vehicles/:id`, for an officer who holds ' +
      '`vehicle.record` and not `vehicle.update`. It applies to a vehicle that came with the ' +
      'legacy register only. The edit is used once for the vehicle, whoever makes it: the next ' +
      'save answers 409 unless the caller holds `vehicle.update_imported`. One edit may not ' +
      'change the plate, the branch or unit, or the linked member (403).',
    body: updateVehicleSchema,
    responses: {
      403: 'The caller may not record at this vehicle, or the edit names a field one edit may not change.',
      404: 'No such vehicle, or it is outside the caller’s area.',
      409: 'The vehicle is not imported, or its one edit is already used.',
    },
  })
  async amendImported(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateVehicleSchema)) body: UpdateVehicleInput,
  ) {
    const actor = this.actor(request);
    return { vehicle: await this.vehicles.amendImported(actor, id, body) };
  }

  @RequirePermission('vehicle.suspend')
  @Patch(':id/status')
  @Documented({
    summary: 'Suspend, lift, or retire a vehicle, declared or on record.',
    description:
      'Item 57: a vehicle on record may be suspended or retired without being declared. ' +
      'Asking for `ACTIVE` lifts a suspension, back to `ACTIVE` if the vehicle was declared ' +
      'and to `ON_RECORD` if not; it never declares a vehicle on record (409), which only ' +
      'declaring does. A reason is always required. Cannot reach or leave `DISPUTED` or `ARCHIVED` through this ' +
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
