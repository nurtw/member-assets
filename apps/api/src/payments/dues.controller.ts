import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
  UnauthorizedException,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { Documented } from '../docs/documented.decorator.js';
import { DuesService } from './dues.service.js';

/**
 * Dues status (PRD Requirements 27.8, 27.13 — item 22). **Internal only.**
 *
 * Each route sits under the record it describes and asks for that record's own
 * read permission, re-checked against the record's organisation in the
 * service: whoever may see a vehicle may see what it owes, and nobody else.
 */
@Controller()
export class DuesController {
  constructor(private readonly dues: DuesService) {}

  @RequirePermission('vehicle.read')
  @Get('vehicles/:id/dues')
  @Documented({
    summary: "A vehicle's levy: what has fallen due and what is paid.",
    description:
      'PRD Requirement 27.13 — the levy falls due on the 1st of each calendar month (Lagos ' +
      'time), starting the month after the vehicle is onboarded, with no proration. Each month ' +
      'is priced at the amount in force when it fell due. Derived from the ledger on every ' +
      'read; nothing is stored. **Internal only** (Requirement 27.8): dues appear in no ' +
      'external response.',
    responses: { 404: 'No such vehicle, or it lies outside the caller’s scope.' },
  })
  async vehicle(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { dues: await this.dues.forVehicle(this.userId(request), id) };
  }

  @RequirePermission('member.read')
  @Get('members/:id/dues')
  @Documented({
    summary: "A member's membership fee: paid, owed, or not yet due.",
    description:
      'PRD Requirement 27.13 — the fee covers 12 months from the date it is paid. It first ' +
      'falls due on approval, or on the go-live date for a member migrated before it; until ' +
      'that date is set, a migrated member’s fee has not started. **Internal only** ' +
      '(Requirement 27.8). Dues do not block card renewal: the issuing officer sees this ' +
      'status instead (PAY-05).',
    responses: { 404: 'No such member, or they lie outside the caller’s scope.' },
  })
  async member(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { dues: await this.dues.forMember(this.userId(request), id) };
  }

  private userId(request: AuthenticatedRequest): string {
    const userId = request.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }
    return userId;
  }
}
