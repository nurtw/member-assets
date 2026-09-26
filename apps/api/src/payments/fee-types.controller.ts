import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Put,
  Req,
} from '@nestjs/common';
import {
  setFeeTypePriceSchema,
  updateFeeTypeSchema,
  type SetFeeTypePriceInput,
  type UpdateFeeTypeInput,
} from '@nurtw/contracts';

import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Documented } from '../docs/documented.decorator.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import { FeeTypeService } from './fee-type.service.js';

/**
 * Fee-type settings (PRD Requirements 27.1–27.2, revision 1.3).
 *
 * Union-wide, like master data: a fee type belongs to no branch, so the
 * guard's permission check is the whole check. Every change carries a
 * mandatory reason and is audited before and after.
 */
@Controller('fee-types')
export class FeeTypesController {
  constructor(private readonly feeTypes: FeeTypeService) {}

  @RequirePermission('payment.read')
  @Get()
  @Documented({
    summary: 'List fee types and their amounts.',
    description:
      'Each fee type with its default amount and any per-route-type amounts (PRD Requirement ' +
      '27.1, revision 1.3). The levy is priced per route type; a route type without its own ' +
      'amount is charged the default. Amounts are integer kobo.',
  })
  async list() {
    return { feeTypes: await this.feeTypes.list() };
  }

  @RequirePermission('fee_type.manage')
  @Patch(':code')
  @Documented({
    summary: 'Amend a fee type’s default amount, label, or availability.',
    description:
      'A reason is mandatory and the change is audited before and after (Requirement 27.2). ' +
      'The code, recurrence, what it is charged against, and its settlement are fixed once the ' +
      'fee type exists. A payment already initiated keeps the amount it was started at.',
    body: updateFeeTypeSchema,
    responses: { 404: 'No such fee type.' },
  })
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('code') code: string,
    @Body(new ZodValidationPipe(updateFeeTypeSchema)) body: UpdateFeeTypeInput,
  ) {
    return { feeType: await this.feeTypes.update(this.actor(request), code, body) };
  }

  @RequirePermission('fee_type.manage')
  @Put(':code/prices/:routeTypeCode')
  @Documented({
    summary: 'Set a fee type’s amount for one route type.',
    description:
      'PRD Requirement 27.1 (revision 1.3, QUESTIONS.md PAY-14) — how the levy is priced per ' +
      'route type. Creates or replaces the amount; a reason is mandatory and the change is ' +
      'audited before and after.',
    body: setFeeTypePriceSchema,
    responses: { 404: 'No such fee type or route type.' },
  })
  async setPrice(
    @Req() request: AuthenticatedRequest,
    @Param('code') code: string,
    @Param('routeTypeCode') routeTypeCode: string,
    @Body(new ZodValidationPipe(setFeeTypePriceSchema)) body: SetFeeTypePriceInput,
  ) {
    return {
      feeType: await this.feeTypes.setPrice(
        this.actor(request),
        code,
        routeTypeCode,
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
