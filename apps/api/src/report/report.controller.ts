import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
} from '@nestjs/common';
import {
  addedVehiclesQuerySchema,
  onboardingReportQuerySchema,
  ownWorkQuerySchema,
  type AddedVehiclesQuery,
  type OnboardingReportQuery,
  type OwnWorkQuery,
} from '@nurtw/contracts';

import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import {
  RequirePermission,
  SignedIn,
} from '../auth/require-permission.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Documented } from '../docs/documented.decorator.js';
import { ReportService } from './report.service.js';

/**
 * Counts and lists for officers (roadmap items 64 to 67).
 *
 * Each route asks for the permission that opens the matching list, and the service
 * counts only inside the organisations in which the caller holds it, so a count
 * never shows more than a list would. Nothing here writes.
 */
@Controller('reports')
export class ReportController {
  constructor(private readonly reports: ReportService) {}

  private userId(request: AuthenticatedRequest): string {
    if (!request.user) {
      throw new BadRequestException();
    }
    return request.user.id;
  }

  @RequirePermission('sticker.read')
  @Get('sticker-origins')
  @Documented({
    summary:
      'Stickers from the imported register and stickers added through the System.',
    description:
      'Item 64 (VEH-41). Counts, for the dashboard: those from the imported register and those ' +
      'added through the System (taken into stock, or signed), and how many of each are attached ' +
      'to a vehicle in the caller’s scope. `total` includes stickers not yet attached, which belong ' +
      'to no branch, so it is `null` unless the caller’s scope is a whole council.',
  })
  async stickerOrigins(@Req() request: AuthenticatedRequest) {
    return { counts: await this.reports.stickerOrigins(this.userId(request)) };
  }

  @RequirePermission('vehicle.read')
  @Get('added-vehicles')
  @Documented({
    summary: 'The vehicles added through the System.',
    description:
      'Item 65 (VEH-42). Vehicles that did not come with the imported register, newest first, ' +
      'within the caller’s scope. Carries no telephone and no address. The owner’s name and the ' +
      'chassis number are present only for a holder of `vehicle.read_restricted`, and `declared` ' +
      'only for a holder of `vehicle.declare`.',
    query: [
      { name: 'from', description: 'First day, YYYY-MM-DD (Lagos).' },
      { name: 'to', description: 'Last day, YYYY-MM-DD (Lagos).' },
      { name: 'q', description: 'Matches the plate number.' },
      { name: 'limit', description: 'At most 200; 50 by default.' },
      { name: 'offset', description: 'Rows to skip.' },
    ],
    responses: { 400: 'A date is not a real day.' },
  })
  async addedVehicles(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(addedVehiclesQuerySchema))
    query: AddedVehiclesQuery,
  ) {
    return this.reports.addedVehicles(this.userId(request), query);
  }

  @RequirePermission('report.read')
  @Get('onboarding')
  @Documented({
    summary: 'How many were onboarded each day, and by which officer.',
    description:
      'Item 66 (GOV-25; the owner’s direction of 18 November 2026). Per Lagos day and officer: ' +
      'vehicles onboarded (legacy and new), members registered, and vehicles recorded, over the records ' +
      'inside the caller’s `report.read` scope. A vehicle is onboarded on the day its first sticker is ' +
      'attached, by the officer who attached it. Imported members are not counted. At most 92 days; ' +
      'the last 14 by default.',
    query: [
      { name: 'from', description: 'First day, YYYY-MM-DD (Lagos).' },
      { name: 'to', description: 'Last day, YYYY-MM-DD (Lagos).' },
    ],
    responses: {
      400: 'Not real days, `from` after `to`, or more than 92 days.',
    },
  })
  async onboarding(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(onboardingReportQuerySchema))
    query: OnboardingReportQuery,
  ) {
    return {
      report: await this.reports.onboarding(this.userId(request), query),
    };
  }

  @RequirePermission('member.read')
  @Get('member-counts')
  @Documented({
    summary: 'Counts of members, for the dashboard.',
    description:
      'Item 67. Members registered through the System, in all and today, and the active and ' +
      'suspended members, inside the caller’s `member.read` scope.',
  })
  async memberCounts(@Req() request: AuthenticatedRequest) {
    return { counts: await this.reports.memberCounts(this.userId(request)) };
  }

  @SignedIn()
  @Get('my-work')
  @Documented({
    summary: 'What the signed-in officer has done, in all and on one day.',
    description:
      'GOV-25; the owner’s direction of 18 November 2026. The caller’s own numbers and no one ' +
      'else’s: vehicles they onboarded (they attached its first sticker; legacy and new), and members ' +
      'they registered, in all since their account was made and on one Lagos day, with the vehicles ' +
      'they added that have no sticker yet. It names no permission because it counts only the ' +
      'caller’s own actions and reads no record.',
    query: [
      {
        name: 'day',
        description: 'The day, YYYY-MM-DD (Lagos). Today when absent.',
      },
    ],
    responses: { 400: 'The day is not a real day.' },
  })
  async myWork(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(ownWorkQuerySchema)) query: OwnWorkQuery,
  ) {
    return { work: await this.reports.ownWork(this.userId(request), query) };
  }

  @RequirePermission('vehicle.read')
  @Get('vehicle-counts')
  @Documented({
    summary: 'Counts of vehicles, for the dashboard.',
    description:
      'Item 67; the owner’s direction of 18 November 2026. In the caller’s scope: vehicles onboarded ' +
      '(a sticker attached) in all and today, each split into legacy and new; onboarded vehicles with ' +
      'no member linked; and vehicles with no sticker yet. `declaration` (not yet declared, and ' +
      'declared) is present only for a holder of `vehicle.declare`.',
  })
  async vehicleCounts(@Req() request: AuthenticatedRequest) {
    return { counts: await this.reports.vehicleCounts(this.userId(request)) };
  }
}
