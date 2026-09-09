import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  createOrganisationSchema,
  moveOrganisationSchema,
  setOrganisationActiveSchema,
  updateOrganisationSchema,
  type CreateOrganisationInput,
  type MoveOrganisationInput,
  type SetOrganisationActiveInput,
  type UpdateOrganisationInput,
} from '@nurtw/contracts';

import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import { Documented } from '../docs/documented.decorator.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  OrganisationService,
  type ActorContext,
} from './organisation.service.js';

/**
 * The hierarchy administration API (PRD §6).
 *
 * `@RequirePermission` here is the coarse gate only — it establishes that the
 * caller holds the permission *somewhere*. The service re-asks against the path
 * of the record actually being touched. Both are required: without the
 * decorator the guard denies by default, and without the service check a branch
 * administrator could act on another branch's nodes.
 */
@Controller('organisations')
export class OrganisationController {
  constructor(private readonly organisations: OrganisationService) {}

  @RequirePermission('organisation.read')
  @Get()
  @Documented({
    summary: 'Retrieve the organisational hierarchy.',
    description:
      'Returns a forest, not a single tree. The response is filtered to the subtrees ' +
      'in which the caller holds `organisation.read`, so a branch administrator legitimately ' +
      'receives a view with no council at its head. The internal materialised path is never ' +
      'returned.',
  })
  async tree(@Req() request: AuthenticatedRequest) {
    const actor = this.actor(request);
    return { organisations: await this.organisations.tree(actor.userId) };
  }

  @RequirePermission('organisation.read')
  @Get(':id')
  @Documented({
    summary: 'Retrieve one organisation.',
    description:
      'A node outside the caller’s readable scope answers 404, identically to a node that ' +
      'does not exist, so identifiers cannot be enumerated.',
    responses: { 404: 'No such organisation, or it lies outside the caller’s scope.' },
  })
  async findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const actor = this.actor(request);
    return { organisation: await this.organisations.findOne(actor.userId, id) };
  }

  @RequirePermission('organisation.manage')
  @Post()
  @Documented({
    summary: 'Create an organisation.',
    description:
      'Authorised against the **parent’s** path: a node that does not yet exist has no path ' +
      'of its own, so the question is whether the caller may add beneath that parent. ' +
      'A council is created with `parentId: null` and therefore requires the permission at ' +
      'the root. Placement is exact — a zone sits beneath a council, a branch beneath a zone, ' +
      'a unit beneath a branch, and nothing skips a level.',
    body: createOrganisationSchema,
    responses: {
      400: 'The body failed validation. Field-level detail is returned.',
      404: 'The parent does not exist, or lies outside the caller’s scope.',
      409: 'The requested placement is not valid for that level, or the parent is inactive.',
    },
  })
  async create(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createOrganisationSchema))
    body: CreateOrganisationInput,
  ) {
    return {
      organisation: await this.organisations.create(this.actor(request), body),
    };
  }

  @RequirePermission('organisation.manage')
  @Patch(':id')
  @Documented({
    summary: 'Rename an organisation.',
    description:
      'Level and parent are deliberately not editable here. Changing a level would invalidate ' +
      'the placement of everything beneath it, and changing a parent is a move — which requires ' +
      'permission at both ends and rewrites descendant paths, so it has its own route.',
    body: updateOrganisationSchema,
    responses: {
      404: 'No such organisation, or it lies outside the caller’s scope.',
      409: 'A state was supplied for a node below council level (PRD §23.2).',
    },
  })
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateOrganisationSchema))
    body: UpdateOrganisationInput,
  ) {
    return {
      organisation: await this.organisations.update(
        this.actor(request),
        id,
        body,
      ),
    };
  }

  /**
   * A separate route from `update` on purpose.
   *
   * A move relocates every member and vehicle beneath the node and is authorised
   * at both ends. Folding it into a general update would hide that behind an
   * optional field, where the second permission check is easy to lose.
   */
  @RequirePermission('organisation.manage')
  @Patch(':id/parent')
  @Documented({
    summary: 'Move an organisation, and every descendant with it.',
    description:
      '**Authorised at both ends.** The caller must hold `organisation.manage` at the node’s ' +
      'current location *and* at the destination. A move is simultaneously a removal and an ' +
      'insertion: checking one end only would let an administrator scoped to one branch pull a ' +
      'node out of another branch into their own scope, acquiring authority over its members ' +
      'without ever holding a permission there. ' +
      'Every descendant path is rewritten in the same transaction. A reason is required and is ' +
      'recorded in the audit trail.',
    body: moveOrganisationSchema,
    responses: {
      400: 'The body failed validation; a reason is required.',
      403: 'The caller lacks the permission at the origin, at the destination, or at both.',
      404: 'The node or the destination lies outside the caller’s scope.',
      409: 'The move would create a cycle, skip a level, or place the node beneath an inactive parent.',
    },
  })
  async move(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(moveOrganisationSchema))
    body: MoveOrganisationInput,
  ) {
    return {
      organisation: await this.organisations.move(this.actor(request), id, body),
    };
  }

  @RequirePermission('organisation.manage')
  @Patch(':id/status')
  @Documented({
    summary: 'Activate or deactivate an organisation.',
    description:
      'Nothing is ever deleted. Deactivation is refused while active children or active members ' +
      'remain, so an administrator works bottom-up and no single request quietly disables a ' +
      'subtree; activation is refused beneath an inactive parent. Together these hold the ' +
      'invariant that an active node’s ancestors are all active.',
    body: setOrganisationActiveSchema,
    responses: {
      404: 'No such organisation, or it lies outside the caller’s scope.',
      409: 'Active children or members remain, the parent is inactive, or the node is already in that state.',
    },
  })
  async setActive(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setOrganisationActiveSchema))
    body: SetOrganisationActiveInput,
  ) {
    return {
      organisation: await this.organisations.setActive(
        this.actor(request),
        id,
        body,
      ),
    };
  }

  private actor(request: AuthenticatedRequest): ActorContext {
    if (!request.user) {
      // Unreachable behind the guard; asserted rather than assumed, because the
      // alternative is an audit event with no actor.
      throw new BadRequestException();
    }
    return {
      userId: request.user.id,
      requestId: request.header('x-request-id') ?? null,
      ipAddress: request.ip ?? null,
    };
  }
}
