import { BadRequestException, Controller, Get, Query, Req } from '@nestjs/common';
import {
  addedVehiclesQuerySchema,
  onboardingReportQuerySchema,
  type AddedVehiclesQuery,
  type OnboardingReportQuery,
} from '@nurtw/contracts';

import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import { RequirePermission, SignedIn } from '../auth/require-permission.decorator.js';
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
    summary: 'Stickers from the imported register and stickers added through the System.',
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
    @Query(new ZodValidationPipe(addedVehiclesQuerySchema)) query: AddedVehiclesQuery,
  ) {
    return this.reports.addedVehicles(this.userId(request), query);
  }

  @RequirePermission('report.read')
  @Get('onboarding')
  @Documented({
    summary: 'How many were onboarded each day, and by which officer.',
    description:
      'Item 66 (GOV-25). Per Lagos day and officer: members registered, vehicles recorded, ' +
      'vehicles declared, and stickers attached, over the records inside the caller’s `report.read` ' +
      'scope. Imported members and vehicles are not counted. At most 92 days; the last 14 by default.',
    query: [
      { name: 'from', description: 'First day, YYYY-MM-DD (Lagos).' },
      { name: 'to', description: 'Last day, YYYY-MM-DD (Lagos).' },
    ],
    responses: { 400: 'Not real days, `from` after `to`, or more than 92 days.' },
  })
  async onboarding(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(onboardingReportQuerySchema))
    query: OnboardingReportQuery,
  ) {
    return { report: await this.reports.onboarding(this.userId(request), query) };
  }

  @RequirePermission('member.read')
  @Get('member-counts')
  @Documented({
    summary: 'Counts of members, for the dashboard.',
    description:
      'Item 67. Active and suspended members, and those registered today and in the last seven days, ' +
      'inside the caller’s `member.read` scope.',
  })
  async memberCounts(@Req() request: AuthenticatedRequest) {
    return { counts: await this.reports.memberCounts(this.userId(request)) };
  }

  @SignedIn()
  @Get('my-work')
  @Documented({
    summary: 'What the signed-in officer did today and over the last seven days.',
    description:
      'GOV-25. The caller’s own numbers and no one else’s: members they registered, vehicles they ' +
      'recorded, and stickers they attached, today and over the last seven Lagos days. It names no ' +
      'permission because it counts only the caller’s own actions and reads no record.',
  })
  async myWork(@Req() request: AuthenticatedRequest) {
    return { work: await this.reports.ownWork(this.userId(request)) };
  }

  @RequirePermission('vehicle.read')
  @Get('vehicle-counts')
  @Documented({
    summary: 'Counts of vehicles, for the dashboard.',
    description:
      'Item 67. Vehicles in the caller’s scope, those added through the System, and those added today. ' +
      'and those with no sticker yet. `declaration` (not yet declared, and declared) is present only ' +
      'for a holder of `vehicle.declare`.',
  })
  async vehicleCounts(@Req() request: AuthenticatedRequest) {
    return { counts: await this.reports.vehicleCounts(this.userId(request)) };
  }
}
