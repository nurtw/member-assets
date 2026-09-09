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
  attachMediaSchema,
  createApplicationSchema,
  reviewApplicationSchema,
  setMemberStatusSchema,
  updateApplicationSchema,
  withdrawApplicationSchema,
  type AttachMediaInput,
  type CreateApplicationInput,
  type ReviewApplicationInput,
  type SetMemberStatusInput,
  type UpdateApplicationInput,
  type WithdrawApplicationInput,
} from '@nurtw/contracts';

import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Documented } from '../docs/documented.decorator.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import { MembershipService } from './membership.service.js';

/**
 * Membership registration (PRD §7).
 *
 * `@RequirePermission` is the coarse gate; the service re-asks against the
 * applicant's own organisation path. Both are needed — without the decorator the
 * guard refuses by default, and without the service check an officer in one
 * branch could act on another branch's applicants.
 */
@Controller('applications')
export class MembershipController {
  constructor(private readonly membership: MembershipService) {}

  @RequirePermission('application.read')
  @Get()
  @Documented({
    summary: 'List membership applications.',
    description:
      'Filtered to the organisation subtrees in which the caller holds `application.read`, ' +
      'not merely ordered by them. Carries no next-of-kin, guarantor, collateral, telephone, ' +
      'or address data: PRD Requirement 7.1 keeps those separate, and a list is where an ' +
      'over-generous projection would disclose the most at once.',
    query: [
      { name: 'status', description: 'Filter by application status.' },
      { name: 'organisationId', description: 'Filter to one unit.' },
    ],
  })
  async list(
    @Req() request: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('organisationId') organisationId?: string,
  ) {
    const actor = this.actor(request);
    return {
      applications: await this.membership.list(actor.userId, {
        status,
        organisationId,
      }),
    };
  }

  @RequirePermission('application.read')
  @Get(':id')
  @Documented({
    summary: 'Retrieve one application in full.',
    description:
      'The only projection carrying next-of-kin, guarantor, and contact detail. An ' +
      'application outside the caller’s scope answers 404, identically to one that does not ' +
      'exist, so identifiers cannot be enumerated.',
    responses: {
      404: 'No such application, or it lies outside the caller’s scope.',
    },
  })
  async findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const actor = this.actor(request);
    return { application: await this.membership.findOne(actor.userId, id) };
  }

  @RequirePermission('member.create')
  @Post()
  @Documented({
    summary: 'Register an applicant.',
    description:
      'Captures all four groups of PRD §7 in one submission — applicant, organisational ' +
      'assignment, next of kin, and guarantor — because the form is completed in one sitting ' +
      'from a paper original, and four endpoints would create four ways to record half of it. ' +
      'Creates the applicant as a member in `PENDING` with **no membership number**: a number ' +
      'is allocated on approval, because somebody whose application is refused was never a ' +
      'member. Authorised against the destination unit’s path.',
    body: createApplicationSchema,
    responses: {
      400: 'The body failed validation. Telephone numbers must be valid Nigerian numbers.',
      403: 'The caller may not register into that unit.',
      404: 'No such organisation.',
      409: 'The organisation is inactive, is not a unit, or a referenced list value is unavailable.',
    },
  })
  async create(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createApplicationSchema))
    body: CreateApplicationInput,
  ) {
    return {
      application: await this.membership.create(this.actor(request), body),
    };
  }

  @RequirePermission('member.create')
  @Patch(':id')
  @Documented({
    summary: 'Amend a draft application.',
    description:
      'Only a draft may be amended. Once submitted, the record is what the reviewer is ' +
      'judging; editing it underneath them would mean the decision recorded in the audit ' +
      'trail refers to something other than what was decided upon. Moving an applicant to ' +
      'another unit requires the permission at that unit too.',
    body: updateApplicationSchema,
    responses: {
      404: 'No such application, or it lies outside the caller’s scope.',
      409: 'The application is no longer a draft.',
    },
  })
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateApplicationSchema))
    body: UpdateApplicationInput,
  ) {
    return {
      application: await this.membership.update(this.actor(request), id, body),
    };
  }

  @RequirePermission('member.create')
  @Patch(':id/media')
  @Documented({
    summary: 'Attach a photograph or signature to a draft application.',
    description:
      'Takes identifiers returned by `POST /media`. An asset uploaded as a signature cannot ' +
      'be attached as a passport photograph: the card composites them differently.',
    body: attachMediaSchema,
    responses: {
      400: 'No such uploaded file, or it is of the wrong kind.',
      409: 'The application is no longer a draft.',
    },
  })
  async attachMedia(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(attachMediaSchema)) body: AttachMediaInput,
  ) {
    return {
      application: await this.membership.attachMedia(
        this.actor(request),
        id,
        body,
      ),
    };
  }

  @RequirePermission('member.create')
  @Post(':id/submission')
  @Documented({
    summary: 'Submit a draft application for review.',
    description: 'Draft to submitted. The application becomes read-only.',
    responses: { 409: 'The application is not a draft.' },
  })
  async submit(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return {
      application: await this.membership.submit(this.actor(request), id),
    };
  }

  @RequirePermission('member.create')
  @Post(':id/withdrawal')
  @Documented({
    summary: 'Withdraw an application before a decision.',
    description:
      'Available up to the point of decision and not after. Permitting withdrawal afterwards ' +
      'would let an applicant erase a refusal.',
    body: withdrawApplicationSchema,
    responses: { 409: 'A decision has already been recorded.' },
  })
  async withdraw(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(withdrawApplicationSchema))
    body: WithdrawApplicationInput,
  ) {
    return {
      application: await this.membership.withdraw(this.actor(request), id, body),
    };
  }

  /**
   * The decision.
   *
   * Requires `application.decide`, which registration does not confer: the
   * officer who records an application is not thereby able to approve it.
   */
  @RequirePermission('application.decide')
  @Post(':id/decision')
  @Documented({
    summary: 'Approve or refuse an application.',
    description:
      'Approval is the **only** route from `PENDING` to `ACTIVE` and the only place a ' +
      'membership number is allocated; both happen in the same transaction as the decision, ' +
      'so a member can never be active without a number nor hold a number without a recorded ' +
      'approval. A refusal requires a reason and an approval does not — the asymmetry is ' +
      'deliberate, because a refusal is the decision an applicant may challenge and an ' +
      'officer will later be asked to justify. Requires `application.decide`, which ' +
      'registration does not confer.',
    body: reviewApplicationSchema,
    responses: {
      400: 'A refusal was submitted without a reason.',
      403: 'The caller may not decide applications in that unit.',
      409: 'The application has already been decided or withdrawn.',
    },
  })
  async review(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewApplicationSchema))
    body: ReviewApplicationInput,
  ) {
    return {
      application: await this.membership.review(this.actor(request), id, body),
    };
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

/** Member status management, after approval. */
@Controller('members')
export class MemberController {
  constructor(private readonly membership: MembershipService) {}

  @RequirePermission('member.suspend')
  @Patch(':id/status')
  @Documented({
    summary: 'Suspend, restore, or cancel a member.',
    description:
      'Suspension is reversible; cancellation is terminal, because the register must be able ' +
      'to answer "was this person a member on that date", and a cancellation that could be ' +
      'silently undone defeats that. A pending applicant cannot be suspended — refuse the ' +
      'application instead. A reason is required and is recorded.',
    body: setMemberStatusSchema,
    responses: {
      404: 'No such member, or they lie outside the caller’s scope.',
      409: 'That transition is not permitted from the member’s current status.',
    },
  })
  async setStatus(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setMemberStatusSchema))
    body: SetMemberStatusInput,
  ) {
    if (!request.user) {
      throw new BadRequestException();
    }
    return {
      member: await this.membership.setMemberStatus(
        {
          userId: request.user.id,
          requestId: request.header('x-request-id') ?? null,
          ipAddress: request.ip ?? null,
        },
        id,
        body,
      ),
    };
  }
}
