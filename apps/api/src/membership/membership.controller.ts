import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  attachMediaSchema,
  createApplicationSchema,
  listMembersQuerySchema,
  removeMemberNinSchema,
  reviewApplicationSchema,
  setMemberNinSchema,
  setMemberStatusSchema,
  updateApplicationSchema,
  withdrawApplicationSchema,
  type AttachMediaInput,
  type CreateApplicationInput,
  type ListMembersQuery,
  type RemoveMemberNinInput,
  type ReviewApplicationInput,
  type SetMemberNinInput,
  type SetMemberStatusInput,
  type UpdateApplicationInput,
  type WithdrawApplicationInput,
} from '@nurtw/contracts';
import type { Response } from 'express';

import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Documented } from '../docs/documented.decorator.js';
import { MAX_IMAGE_BYTES } from '../media/media.service.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import { MembershipService } from './membership.service.js';

/**
 * The part of multer's uploaded file the photograph route uses: the bytes.
 * The declared type and the file's name are the caller's to choose, so they
 * are not read (see `MediaController`).
 */
interface UploadedPhotograph {
  buffer: Buffer;
  size: number;
}

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

  /**
   * The registration form, filled in, for wet signature (PRD §23.16).
   *
   * `member_sensitive.read`, not `application.read`: the document carries next
   * of kin, guarantor, telephone, and residential address — that is what the
   * form is. An officer who can see that an application exists is not thereby
   * entitled to print everything on it.
   */
  @RequirePermission('member_sensitive.read')
  @Get(':id/form')
  @Documented({
    summary: 'Render the registration form as a PDF for wet signature.',
    description:
      'The other half of the hybrid determined at PRD §23.16: data captured digitally, and a ' +
      'printed form produced where the Union’s process requires a physical signature. ' +
      'Requires `member_sensitive.read` because the document carries next-of-kin, guarantor, ' +
      'telephone, and residential address — PRD Requirement 7.1 data that the list and every ' +
      'card projection deliberately exclude.',
    responses: {
      404: 'No such application, or it lies outside the caller’s scope.',
    },
  })
  async form(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const actor = this.actor(request);
    const { bytes, filename } = await this.membership.registrationForm(
      actor.userId,
      id,
    );

    response.setHeader('X-Content-Type-Options', 'nosniff');
    // Registration data. Never held by a shared proxy, and never cached.
    response.setHeader('Cache-Control', 'no-store');

    // `StreamableFile`, not a bare `Buffer` — Nest serialises a returned object
    // as JSON, and a Buffer is an object.
    return new StreamableFile(Buffer.from(bytes), {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
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

/** Member lookup and status management, after approval. */
@Controller('members')
export class MemberController {
  constructor(private readonly membership: MembershipService) {}

  @RequirePermission('member.read')
  @Get()
  @Documented({
    summary: 'List or search members by name or membership number.',
    description:
      'The Members screen’s list, and the lookup behind pickers elsewhere in the System — ' +
      'vehicle declaration’s owner field, for one. Returns no next-of-kin, guarantor, ' +
      'contact, or application data, and only the branch/unit subtrees the caller holds ' +
      '`member.read` in. It is an officer’s list, never a directory for anybody else.',
    query: [
      { name: 'q', description: 'Matches surname, first name, or membership number.' },
      { name: 'organisationId', description: 'Filter to one unit.' },
      {
        name: 'status',
        description:
          'One member status, or several separated by commas. Omitted, every status is ' +
          'returned, pending applicants included.',
      },
      {
        name: 'limit',
        description: 'How many to return, from 1 to 200. Omitted, 20.',
      },
    ],
    responses: { 400: 'An unknown status, or a limit outside 1 to 200.' },
  })
  async searchMembers(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(listMembersQuerySchema)) query: ListMembersQuery,
  ) {
    if (!request.user) {
      throw new BadRequestException();
    }
    return {
      members: await this.membership.searchMembers(request.user.id, {
        q: query.q,
        organisationId: query.organisationId,
        statuses: query.status,
        limit: query.limit,
      }),
    };
  }

  @RequirePermission('member.read')
  @Get(':id')
  @Documented({
    summary: 'Retrieve one member’s record.',
    description:
      'Keyed by the member, so a member with no application — every migrated member — can ' +
      'be opened. The application’s number and status are included only for a reader of ' +
      'applications over this member. Contact, next of kin, and guarantor are included ' +
      'only for a holder of `member_sensitive.read` over this member. A part the caller ' +
      'may not read is left out of the response.',
    responses: {
      404: 'No such member, or they lie outside the caller’s scope.',
    },
  })
  async findMember(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (!request.user) {
      throw new BadRequestException();
    }
    return { member: await this.membership.findMember(request.user.id, id) };
  }

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

  @RequirePermission('member.update')
  @Put(':id/nin')
  @Documented({
    summary: 'Record or replace a member’s NIN.',
    description:
      'Item 44 (PRD Requirement 7.4). Eleven digits; spaces and dashes are taken out. The ' +
      'NIN is sealed at rest and returned by no route: the answer says only that one is ' +
      'recorded, and its last four digits. For any member but a cancelled one, migrated ' +
      'and approved members included. The audit trail records that it changed, not to what.',
    body: setMemberNinSchema,
    responses: {
      404: 'No such member, or they lie outside the caller’s scope.',
      409: 'The NIN is recorded for another member, or the membership is cancelled.',
      503: 'IDENTITY_ENCRYPTION_KEY is not configured, so no NIN can be sealed.',
    },
  })
  async setNin(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setMemberNinSchema)) body: SetMemberNinInput,
  ) {
    return { identity: await this.membership.setNin(this.actor(request), id, body) };
  }

  @RequirePermission('member.update')
  @Post(':id/nin/removal')
  @Documented({
    summary: 'Take a member’s NIN off their record.',
    description:
      'Item 44. For a NIN recorded against the wrong member, which would otherwise keep it ' +
      'from the member it belongs to. A reason is required and is recorded.',
    body: removeMemberNinSchema,
    responses: {
      404: 'No such member, or they lie outside the caller’s scope.',
      409: 'No NIN is recorded for this member, or the membership is cancelled.',
    },
  })
  async removeNin(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(removeMemberNinSchema)) body: RemoveMemberNinInput,
  ) {
    return { identity: await this.membership.removeNin(this.actor(request), id, body) };
  }

  @RequirePermission('member.update')
  @Post(':id/photograph')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES } }),
  )
  @Documented({
    summary: 'Add or replace a member’s photograph.',
    description:
      'Item 44. Multipart, field name `file`. For any member but a cancelled one, after ' +
      'approval included; an application still in draft attaches its photograph as before. ' +
      'The bytes decide what the file is, as for every upload. A card keeps the photograph ' +
      'it printed, and the one replaced is discarded unless a card holds it. The answer ' +
      'carries a signed link to the new photograph, good for a few minutes.',
    responses: {
      400: 'No file, an empty or oversized one, or bytes that are not a supported image.',
      404: 'No such member, or they lie outside the caller’s scope.',
      409: 'The membership is cancelled.',
    },
  })
  async setPhotograph(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedPhotograph | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('A file is required.');
    }
    return {
      photograph: await this.membership.setPhotograph(
        this.actor(request),
        id,
        file.buffer,
      ),
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
