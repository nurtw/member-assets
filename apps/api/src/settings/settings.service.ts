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

  /**
   * A date setting, or `null` when the row is absent or unreadable.
   *
   * Written as `YYYY-MM-DD` and read as the start of that day in Lagos
   * (UTC+1), which is where the Union's calendar runs. `null` rather than a
   * fallback date: a date the Union has not given must read as "not set", so
   * that nothing is charged from a day nobody chose.
   */
  async getDate(key: string): Promise<Date | null> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key },
      select: { value: true },
    });
    const value = row?.value.trim() ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return null;
    }
    const date = new Date(`${value}T00:00:00+01:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  /** A text setting, trimmed, or `null` when absent or blank. */
  async getString(key: string): Promise<string | null> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key },
      select: { value: true },
    });
    const value = row?.value.trim() ?? '';
    return value === '' ? null : value;
  }

  /**
   * A percentage from 0 to below 100, to two decimal places, or `null` when
   * absent or unreadable. `null` rather than a fallback, for the reason
   * `getDate` gives: a rate nobody set must read as "not set".
   */
  async getPercentage(key: string): Promise<number | null> {
    const value = await this.getString(key);
    if (value === null || !/^\d{1,2}(\.\d{1,2})?$/.test(value)) {
      return null;
    }
    return Number(value);
  }

  /**
   * A whole number of at least 1, or `fallback` when the row is absent or
   * unreadable. A fallback is right here, where `getDate` refuses one: these
   * are limits the PRD determined, so the determined value is the safe reading
   * of a row that is missing or mistyped.
   */
  async getPositiveInteger(key: string, fallback: number): Promise<number> {
    const value = await this.getString(key);
    if (value === null || !/^\d{1,6}$/.test(value)) {
      return fallback;
    }
    const parsed = Number(value);
    return parsed >= 1 ? parsed : fallback;
  }

  /**
   * Writes a setting. Callers audit the change themselves, with the reason
   * the change was made: this method knows neither.
   */
  async set(key: string, value: string, actorUserId: string): Promise<void> {
    await this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value, updatedByUserId: actorUserId },
      update: { value, updatedByUserId: actorUserId },
    });
  }
}

/**
 * The contractor's percentage of each dedicated-account transfer, applied by
 * Paystack as the NURTW subaccount's fixed split (PRD Requirement 27.7,
 * item 23).
 *
 * **Ships unset**, pending the dedicated-account pricing that QUESTIONS.md
 * **PAY-11** says must be confirmed from the Paystack dashboard. Until it is
 * set, no dedicated account can be assigned: a member would otherwise send
 * money that splits at a rate nobody chose. It is changed only through
 * `PUT /payments/settlement/dedicated-percentage`, which also updates the
 * subaccount at Paystack; editing this row alone would leave the two apart.
 */
export const DEDICATED_CONTRACTOR_PERCENTAGE =
  'payments.dedicated_account.contractor_percentage';

/**
 * The order dedicated-account money pays dues in (PAY-12: "the order is a
 * setting"). Seeded `OLDEST_FIRST`, the Union's answer. An unreadable value
 * falls back to that, never to another order.
 */
export const DEDICATED_ALLOCATION_ORDER =
  'payments.dedicated_account.allocation_order';

/**
 * The go-live date (`YYYY-MM-DD`). PRD Requirement 27.13: a member migrated
 * before go-live first owes the membership fee on this date.
 *
 * **Ships unset**, pending QUESTIONS.md **GOV-11**. Until the Union names the
 * date, a migrated member's fee has not started, and the System says so rather
 * than counting from a date it made up.
 */
export const DUES_GO_LIVE_DATE = 'dues.go_live_date';

/**
 * How many days an external API token lasts (PRD Requirement 12.6, §23.12).
 * Seeded 90, the Union's determination, which is also the fallback.
 */
export const API_TOKEN_EXPIRY_DAYS = 'api_token.expiry_days';

/**
 * How many days before a token expires it is flagged for replacement on the
 * API access screen (Requirement 12.6, `QUESTIONS.md` EXT-10). Seeded 14.
 */
export const API_TOKEN_REMINDER_DAYS = 'api_token.reminder_days';

/**
 * A filtered vehicle total below this is answered `SUPPRESSED` (PRD
 * Requirement 13.3, §23.12). Seeded 25, the Union's determination, which is
 * also the fallback.
 */
export const AGGREGATE_SUPPRESSION_FLOOR = 'aggregate.suppression_floor';

/**
 * A filtered vehicle total is rounded to the nearest multiple of this, so one
 * total cannot be subtracted from another to uncover a small one (the owner's
 * direction of 4 October 2026, `QUESTIONS.md` EXT-18). Seeded 10. A value of
 * 1 turns rounding off.
 */
export const AGGREGATE_ROUNDING_BASE = 'aggregate.rounding_base';

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
