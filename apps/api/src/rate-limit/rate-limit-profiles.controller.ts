import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  createRateLimitProfileSchema,
  updateRateLimitProfileSchema,
  type CreateRateLimitProfileInput,
  type UpdateRateLimitProfileInput,
} from '@nurtw/contracts';

import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Documented } from '../docs/documented.decorator.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import { RateLimitService } from './rate-limit.service.js';

/**
 * Limit profiles (PRD §14, §23.12 — item 13). Officer routes.
 *
 * Reading them is `api_client.read`, so an officer approving an organisation
 * sees what each profile would hold it to. Changing one is
 * `rate_limit.manage`, a security administrator's permission, because a
 * profile governs every organisation that holds it.
 */
@Controller('rate-limits/profiles')
export class RateLimitProfilesController {
  constructor(private readonly rateLimits: RateLimitService) {}

  @RequirePermission('api_client.read')
  @Get()
  @Documented({
    summary: 'List limit profiles.',
    description:
      'Each profile with its rates, burst, hourly and daily quotas, the thresholds abuse ' +
      'detection applies, the length of a pause, and how many organisations hold it ' +
      '(PRD §14, §23.12).',
  })
  async list() {
    return { profiles: await this.rateLimits.listProfiles() };
  }

  @RequirePermission('rate_limit.manage')
  @Post()
  @Documented({
    summary: 'Create a limit profile.',
    description:
      'For a kind of organisation the existing profiles do not fit. Every number is required. ' +
      'The code is fixed once created. Audited.',
    body: createRateLimitProfileSchema,
    responses: { 409: 'A profile with that code exists.' },
  })
  async create(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createRateLimitProfileSchema))
    body: CreateRateLimitProfileInput,
  ) {
    return {
      profile: await this.rateLimits.createProfile(this.actor(request), body),
    };
  }

  @RequirePermission('rate_limit.manage')
  @Put(':code')
  @Documented({
    summary: 'Change a limit profile.',
    description:
      'PRD Requirement 14.1 — changed at runtime, without a deployment. Replaces every number ' +
      'in the profile, and applies to the next request of each organisation holding it. A ' +
      'reason is mandatory and the change is audited before and after.',
    body: updateRateLimitProfileSchema,
    responses: { 404: 'No such profile.' },
  })
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('code') code: string,
    @Body(new ZodValidationPipe(updateRateLimitProfileSchema))
    body: UpdateRateLimitProfileInput,
  ) {
    return {
      profile: await this.rateLimits.updateProfile(
        this.actor(request),
        code,
        body,
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
