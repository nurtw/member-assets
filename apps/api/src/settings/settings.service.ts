import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Runtime configuration (PRD Requirement 14.1, `ARCHITECTURE.md` Decision 8.3).
 *
 * Limits, thresholds, and governance switches are rows in `system_setting`, not
 * constants, so the Union can change them without a deployment. The seed writes
 * initial values and never overwrites them: once set, the Union owns them.
 *
 * **Read on every call, deliberately.** A cache here would mean an administrator
 * turning a control on and it taking effect at some unpredictable later moment —
 * and the first control to use this service decides whether one officer may
 * approve their own work, which is exactly the kind of switch that must take
 * effect on the next request. The volume does not justify the risk: one indexed
 * primary-key lookup on a table with a handful of rows.
 */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A boolean setting, or `fallback` when the row is absent or unreadable.
   *
   * Only the exact string `true` is true. A missing row, an empty value, or
   * anything unparseable falls back rather than throwing — a malformed setting
   * must not take the System down, and for a governance switch the fallback is
   * the value shipped, which is the conservative one.
   */
  async isEnabled(key: string, fallback = false): Promise<boolean> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key },
      select: { value: true },
    });
    if (!row) {
      return fallback;
    }
    const value = row.value.trim().toLowerCase();
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }
    return fallback;
  }
}

/**
 * Whether a second officer must approve.
 *
 * When true, the officer who recorded a membership application may not decide
 * it, and the officer who prepared a card may not approve it.
 *
 * **Ships `false`**, pending QUESTIONS.md **MEM-04**. The Union has not said
 * whether a second approval is required, and with a single administrator account
 * on the System enforcing it would make a registration impossible to complete.
 * The control is built so that answering MEM-04 is a settings change rather than
 * a migration — the same treatment step-up re-authentication received at
 * Decision 9.7.3.
 */
export const REQUIRE_SEPARATE_OFFICER = 'approval.require_separate_officer';
