import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { LAUNCH_FEE_TYPES } from './launch-fee-types.js';

export { LAUNCH_FEE_TYPES };

/**
 * Fee types are data, not code (Requirement 27.1). This service is the only
 * reader; a route or a background job asks it for the current amount rather
 * than holding one of its own, so a settings change reaches every caller on
 * its next read — the same "read on every call" discipline as
 * `SettingsService`.
 */
@Injectable()
export class FeeTypeService {
  constructor(private readonly prisma: PrismaService) {}

  async seedLaunchFeeTypes(): Promise<void> {
    for (const feeType of LAUNCH_FEE_TYPES) {
      await this.prisma.feeType.upsert({
        where: { code: feeType.code },
        create: feeType,
        update: {},
      });
    }
  }

  async findByCode(code: string) {
    const feeType = await this.prisma.feeType.findUnique({ where: { code } });
    if (!feeType || !feeType.active) {
      throw new NotFoundException(`No active fee type "${code}".`);
    }
    return feeType;
  }

  async list() {
    return this.prisma.feeType.findMany({ orderBy: { code: 'asc' } });
  }
}
