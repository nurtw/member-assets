import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';

/**
 * The four launch fee types (PRD Requirement 27.2 / `QUESTIONS.md` PAY-02).
 * These are **not placeholders** — the owner set them for live charging.
 * Seeding is idempotent (`upsert` on `code`) so re-running it never resets
 * an amount a super administrator has since changed in settings.
 */
export const LAUNCH_FEE_TYPES = [
  {
    code: 'STICKER_REATTACHMENT',
    label: 'Sticker reattachment',
    amountKobo: 200_000,
    recurrence: 'ONE_OFF',
    chargedAgainst: 'VEHICLE',
    settlement: 'CONTRACTOR_ONLY',
  },
  {
    code: 'STICKER_NEW',
    label: 'New sticker',
    amountKobo: 200_000,
    recurrence: 'ONE_OFF',
    chargedAgainst: 'VEHICLE',
    settlement: 'CONTRACTOR_ONLY',
  },
  {
    code: 'LEVY',
    label: 'Monthly levy',
    amountKobo: 500_000,
    recurrence: 'MONTHLY',
    chargedAgainst: 'VEHICLE',
    settlement: 'SPLIT_WITH_NURTW',
  },
  {
    code: 'MEMBERSHIP',
    label: 'Yearly membership fee',
    amountKobo: 3_000_000,
    recurrence: 'YEARLY',
    chargedAgainst: 'MEMBER',
    settlement: 'SPLIT_WITH_NURTW',
  },
] as const satisfies readonly Prisma.FeeTypeCreateInput[];

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
