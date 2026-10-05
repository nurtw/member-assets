"use client";

import {
  PORTAL_USAGE_LABELS,
  type PortalMe,
  type PortalUsage,
  type PortalUsageDay,
} from "@nurtw/contracts";
import { useState } from "react";
import useSWR from "swr";

import { ErrorNotice, Section, Select } from "@/components/ui";
import { ApiError, fetcher } from "@/lib/api";

/**
 * The organisation's own usage (item 29).
 *
 * Three forms, each for one job: two headline figures (the period's requests,
 * and today against the daily quota), one single-series column chart of
 * requests by day, and a table of what those requests came to. One series, so
 * one hue and no legend; the title names it. Every figure is also in the
 * table view, so nothing depends on reading the chart.
 *
 * The classes are the API's own: a forged code is counted with every other
 * non-match, and a refusal carries no reason (`portalUsageClass`).
 */

const RANGES = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
];

const CLASSES = Object.keys(
  PORTAL_USAGE_LABELS,
) as (keyof typeof PORTAL_USAGE_LABELS)[];

function count(value: number): string {
  return value.toLocaleString("en-NG");
}

/** `2026-10-05` as "5 Oct". The day is already a Lagos day; no zone applies. */
function shortDate(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, date!)).toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    },
  );
}

/** A round number at or above the peak, so the gridlines read cleanly. */
function niceCeiling(peak: number): number {
  if (peak <= 4) {
    return 4;
  }
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  for (const step of [1, 2, 4, 5, 10]) {
    if (peak <= step * magnitude) {
      return step * magnitude;
    }
  }
  return 10 * magnitude;
}

export function PortalUsageSection({
  limits,
}: {
  limits: PortalMe["organisation"]["limits"];
}) {
  const [days, setDays] = useState(30);
  const [asTable, setAsTable] = useState(false);
  const { data, error } = useSWR<PortalUsage>(
    `/portal/usage?days=${days}`,
    fetcher,
    { keepPreviousData: true },
  );

  return (
    <Section
      title="Usage"
      description="Your organisation's own requests to the API, counted by day in Lagos time. No plate, sticker, or membership number you looked up is kept or shown."
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-48">
          <label htmlFor="usageRange" className="sr-only">
            Period
          </label>
          <Select
            id="usageRange"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            {RANGES.map((range) => (
              <option key={range.value} value={range.value}>
                {range.label}
              </option>
            ))}
          </Select>
        </div>
        <button
          type="button"
          onClick={() => setAsTable((current) => !current)}
          aria-pressed={asTable}
          className="text-sm font-medium underline underline-offset-2"
        >
          {asTable ? "Show the chart" : "Show as a table"}
        </button>
      </div>

      {error instanceof ApiError ? (
        <ErrorNotice message={error.message} requestId={error.requestId} />
      ) : null}

      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Figure
              label={`Requests, ${RANGES.find((range) => range.value === days)?.label.toLowerCase()}`}
              value={count(data.total)}
            />
            {limits ? (
              <QuotaMeter used={limits.usedToday} quota={limits.dailyQuota} />
            ) : null}
          </div>

          {asTable ? (
            <DailyTable days={data.days} />
          ) : (
            <DailyChart days={data.days} />
          )}

          <Breakdown usage={data} />
        </>
      ) : !error ? (
        <p className="text-sm text-faint-foreground">Loading…</p>
      ) : null}
    </Section>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-faint-foreground">
        {label}
      </p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/** Today's requests against the daily quota: one ratio, so a meter. */
function QuotaMeter({ used, quota }: { used: number; quota: number }) {
  const share = quota > 0 ? Math.min(1, used / quota) : 0;
  return (
    <div className="rounded-md border border-line px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-faint-foreground">
        Today, of your daily quota
      </p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">
        {count(used)}
        <span className="text-base font-normal text-faint-foreground">
          {" "}
          of {count(quota)}
        </span>
      </p>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={quota}
        aria-valuenow={Math.min(used, quota)}
        aria-label="Requests today against the daily quota"
        className="mt-2 h-2 overflow-hidden rounded-full bg-chart-series/15"
      >
        <div
          className="h-full rounded-full bg-chart-series"
          style={{ width: `${share * 100}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-faint-foreground">
        The quota starts again at midnight, Lagos time.
      </p>
    </div>
  );
}

/**
 * Requests by day. Thin columns from one baseline, rounded at the data end,
 * with air between them; a hover or focus on a day's band shows its figures.
 */
function DailyChart({ days }: { days: PortalUsageDay[] }) {
  const [active, setActive] = useState<number | null>(null);
  const peak = Math.max(0, ...days.map((day) => day.total));
  const ceiling = niceCeiling(peak);
  const peakIndex = peak > 0 ? days.findIndex((day) => day.total === peak) : -1;
  const shown = active !== null ? days[active] : null;
  const marks = [0, Math.floor((days.length - 1) / 2), days.length - 1];

  return (
    <figure className="grid gap-2">
      <figcaption className="text-sm font-medium">Requests by day</figcaption>
      <div className="grid grid-cols-[auto_1fr] gap-x-2">
        <div
          className="flex h-40 flex-col justify-between text-right text-[11px] tabular-nums text-faint-foreground"
          aria-hidden
        >
          <span className="-translate-y-1.5">{count(ceiling)}</span>
          <span>{count(ceiling / 2)}</span>
          <span className="translate-y-1.5">0</span>
        </div>
        <div className="relative h-40">
          {/* Recessive gridlines; the baseline a little firmer. */}
          <div
            className="pointer-events-none absolute inset-0 flex flex-col justify-between"
            aria-hidden
          >
            <span className="border-t border-chart-grid" />
            <span className="border-t border-chart-grid" />
            <span className="border-t border-chart-axis" />
          </div>
          <div
            className="absolute inset-0 flex items-end"
            onMouseLeave={() => setActive(null)}
          >
            {days.map((day, index) => (
              <button
                key={day.day}
                type="button"
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                aria-label={`${shortDate(day.day)}: ${count(day.total)} requests`}
                // The whole band is the target, not the thin mark.
                className={
                  "group relative flex h-full min-w-0 flex-1 items-end justify-center px-px outline-none " +
                  (active === index ? "bg-chart-hover" : "")
                }
              >
                {index === peakIndex && active === null ? (
                  <span
                    className="absolute left-1/2 -translate-x-1/2 text-[11px] font-medium tabular-nums text-foreground"
                    style={{
                      bottom: `calc(${(day.total / ceiling) * 100}% + 2px)`,
                    }}
                  >
                    {count(day.total)}
                  </span>
                ) : null}
                <span
                  className="block w-full max-w-6 rounded-t bg-chart-series group-focus-visible:ring-2 group-focus-visible:ring-foreground"
                  style={{
                    height: `${(day.total / ceiling) * 100}%`,
                    minHeight: day.total > 0 ? 2 : 0,
                  }}
                />
              </button>
            ))}
          </div>
        </div>
        <span />
        <div
          className="relative mt-1 h-4 text-[11px] text-faint-foreground"
          aria-hidden
        >
          {marks.map((index, position) => (
            <span
              key={index}
              className={
                "absolute " +
                (position === 0
                  ? "left-0"
                  : position === 1
                    ? "left-1/2 -translate-x-1/2"
                    : "right-0")
              }
            >
              {days[index] ? shortDate(days[index].day) : ""}
            </span>
          ))}
        </div>
      </div>

      {/* The day under the pointer or the keyboard, read out as it changes. */}
      <p className="min-h-10 text-sm" role="status" aria-live="polite">
        {shown ? (
          <>
            <span className="font-semibold">{shortDate(shown.day)}</span>:{" "}
            {count(shown.total)} request{shown.total === 1 ? "" : "s"}
            {shown.total > 0 ? (
              <span className="text-muted-foreground">
                {" "}
                —{" "}
                {CLASSES.filter((usage) => shown.byClass[usage] > 0)
                  .map(
                    (usage) =>
                      `${PORTAL_USAGE_LABELS[usage].toLowerCase()} ${count(shown.byClass[usage])}`,
                  )
                  .join(", ")}
              </span>
            ) : null}
          </>
        ) : (
          <span className="text-faint-foreground">
            Point at a day, or move to it with the keyboard, for its figures.
          </span>
        )}
      </p>
    </figure>
  );
}

function DailyTable({ days }: { days: PortalUsageDay[] }) {
  const newestFirst = [...days].reverse();
  return (
    <div className="max-h-80 overflow-auto rounded-md border border-line">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Requests by day, newest first</caption>
        <thead className="sticky top-0 bg-surface-muted text-xs uppercase tracking-wide text-faint-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Day
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Requests
            </th>
            {CLASSES.map((usage) => (
              <th
                key={usage}
                scope="col"
                className="px-3 py-2 text-right font-medium"
              >
                {PORTAL_USAGE_LABELS[usage]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {newestFirst.map((day) => (
            <tr key={day.day} className="border-t border-line">
              <th
                scope="row"
                className="whitespace-nowrap px-3 py-1.5 font-normal"
              >
                {shortDate(day.day)}
              </th>
              <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                {count(day.total)}
              </td>
              {CLASSES.map((usage) => (
                <td
                  key={usage}
                  className="px-3 py-1.5 text-right tabular-nums text-muted-foreground"
                >
                  {count(day.byClass[usage])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const EXPLAINED: Partial<Record<keyof typeof PORTAL_USAGE_LABELS, string>> = {
  NO_MATCH: "No matching record under the criteria sent.",
  LIMITED:
    "Over a rate limit or the daily quota, or while requests were paused. These are not counted against your quota.",
  REFUSED:
    "The token was missing, expired, revoked, or lacked the scope for that route.",
  INVALID_REQUEST:
    "The request body or its request id was not as the API expects.",
};

/** What the period's requests came to. A handful of classes: a table. */
function Breakdown({ usage }: { usage: PortalUsage }) {
  const rows = CLASSES.filter(
    (name) => name !== "OTHER" || usage.totals.OTHER > 0,
  );
  return (
    <table className="w-full text-left text-sm">
      <caption className="pb-2 text-left text-sm font-medium">
        What they came to
      </caption>
      <thead className="text-xs uppercase tracking-wide text-faint-foreground">
        <tr>
          <th scope="col" className="py-1.5 font-medium">
            Outcome
          </th>
          <th scope="col" className="py-1.5 pl-3 text-right font-medium">
            Requests
          </th>
          <th scope="col" className="py-1.5 pl-3 text-right font-medium">
            Share
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((name) => (
          <tr key={name} className="border-t border-line align-top">
            <th scope="row" className="py-2 font-normal">
              {PORTAL_USAGE_LABELS[name]}
              {EXPLAINED[name] ? (
                <span className="block text-xs text-faint-foreground">
                  {EXPLAINED[name]}
                </span>
              ) : null}
            </th>
            <td className="py-2 pl-3 text-right font-medium tabular-nums">
              {count(usage.totals[name])}
            </td>
            <td className="py-2 pl-3 text-right tabular-nums text-muted-foreground">
              {usage.total > 0
                ? `${Math.round((usage.totals[name] / usage.total) * 100)}%`
                : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
