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
  createDisclosureProfileSchema,
  updateDisclosureProfileSchema,
  type CreateDisclosureProfileInput,
  type UpdateDisclosureProfileInput,
} from '@nurtw/contracts';

import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Documented } from '../docs/documented.decorator.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import { DisclosureProfileService } from './disclosure-profile.service.js';

/**
 * Disclosure profiles (PRD §15 — item 11). Union-wide, like master data: the
 * guard's permission check is the whole check.
 */
@Controller('disclosure-profiles')
export class DisclosureProfilesController {
  constructor(private readonly profiles: DisclosureProfileService) {}

  @RequirePermission('disclosure_profile.read')
  @Get()
  @Documented({
    summary: 'List disclosure profiles.',
    description:
      'Each profile with the record fields it permits and the number of organisations ' +
      'holding it (PRD §15). A field is named as a verification response carries it. A ' +
      'profile naming no field confirms a match and discloses nothing about the record.',
  })
  async list() {
    return { profiles: await this.profiles.list() };
  }

  @RequirePermission('disclosure_profile.manage')
  @Post()
  @Documented({
    summary: 'Compose a disclosure profile.',
    description:
      'PRD Requirement 15.1 — a new profile needs no release. It may name only ' +
      'external-admissible fields: an internal-only field, such as anything naming ' +
      'declaration, a member’s name, or a number that identifies a record, is refused ' +
      'here and would be dropped by the projection regardless (Requirement 12.7). The code ' +
      'is fixed once created.',
    body: createDisclosureProfileSchema,
    responses: { 409: 'A profile with that code exists.' },
  })
  async create(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createDisclosureProfileSchema))
    body: CreateDisclosureProfileInput,
  ) {
    return { profile: await this.profiles.create(this.actor(request), body) };
  }

  @RequirePermission('disclosure_profile.manage')
  @Patch(':id')
  @Documented({
    summary: 'Amend a profile the Union composed.',
    description:
      'A reason is mandatory, and the change is audited with the field set before and ' +
      'after. A change of fields applies from the next request to every organisation ' +
      'holding the profile. The profiles seeded from PRD §15 cannot be amended, so that ' +
      '"Minimal verification" goes on meaning what the PRD says. A profile organisations ' +
      'still hold cannot be withdrawn from use.',
    body: updateDisclosureProfileSchema,
    responses: {
      404: 'No such profile.',
      409: 'A system profile, or one that organisations still hold.',
    },
  })
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateDisclosureProfileSchema))
    body: UpdateDisclosureProfileInput,
  ) {
    return {
      profile: await this.profiles.update(this.actor(request), id, body),
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
