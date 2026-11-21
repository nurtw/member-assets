"use client";

import type {
  MemberCounts,
  OnboardedVehicles,
  OnboardingReport,
  OwnWork,
  StickerOriginCounts,
  VehicleCounts,
} from "@nurtw/contracts";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import useSWR from "swr";

import { TextInput } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { lagosDay, readableDay } from "@/lib/lagos-day";
import { useSession } from "@/lib/session";

/**
 * The counts on Home (item 67, `QUESTIONS.md` GOV-25, answered 17 November 2026, and
 * GOV-26, the owner's direction of 18 November 2026).
 *
 * **A vehicle is onboarded once a sticker is attached to it**, legacy or new, and the
 * officer who attached its first sticker onboarded it. Every block leads with that total,
 * and shows the legacy and new split beneath it.
 *
 * - **The field enumerator** sees **only their own work**: vehicles onboarded and members
 *   registered since their account was made, and the same for one day they choose (today
 *   by default). Nothing about declaring, and no one else's numbers.
 * - **Administrators, the auditor, and the super administrator** see the area's vehicles
 *   onboarded, those with no driver linked or no sticker yet, the members registered, the
 *   stickers, and today's work by each officer. The super administrator alone also sees
 *   the declared figures, because only the API sends them (VEH-28, VEH-43).
 * - **The vehicle-record officer** sees the area's vehicles.
 * - **The card administrator** sees what waits for them, above this.
 *
 * A block is offered only to an officer who holds the permission that opens the matching
 * list, and the API counts only inside the organisations where they hold it, so a count
 * never shows more than a list would. Nothing here polls: the figures load when Home
 * opens, and again when the tab is used after a while.
 */

const n = (value: number) => value.toLocaleString("en-GB");

/** The split beneath a total of vehicles onboarded. */
const split = (vehicles: OnboardedVehicles) =>
  `${n(vehicles.imported)} legacy · ${n(vehicles.added)} new`;

function Figure({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
      {detail ? (
        <dd className="text-xs text-muted-foreground tabular-nums">{detail}</dd>
      ) : null}
    </div>
  );
}

function Block({
  title,
  href,
  linkText,
  aside,
  className,
  children,
}: {
  title: string;
  href?: string;
  linkText?: string;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={`rounded-2xl border border-line bg-surface p-4 shadow-card ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {href ? (
          <Link
            href={href}
            className="text-xs text-link underline-offset-2 hover:underline"
          >
            {linkText ?? "Open"}
          </Link>
        ) : null}
        {aside}
      </div>
      {children}
    </section>
  );
}

function Figures({ children }: { children: ReactNode }) {
  return <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3">{children}</dl>;
}

/**
 * The field enumerator's own numbers: the totals since their account was made, then one
 * day, chosen with the date picker.
 */
function OwnWorkBlock({ today }: { today: string }) {
  const [day, setDay] = useState(today);
  const { data } = useSWR<{ work: OwnWork }>(
    `/reports/my-work?day=${day || today}`,
    fetcher,
    { keepPreviousData: true },
  );
  const work = data?.work;
  if (!work) {
    return null;
  }
  const isToday = work.day === today;

  return (
    <Block
      title="Your work"
      className="sm:col-span-2"
      aside={
        <span className="text-xs text-muted-foreground">
          Since {readableDay(work.since)}
        </span>
      }
    >
      <Figures>
        <Figure
          label="Vehicles onboarded"
          value={n(work.total.vehiclesOnboarded.total)}
          detail={split(work.total.vehiclesOnboarded)}
        />
        <Figure
          label="Members registered"
          value={n(work.total.membersRegistered)}
        />
      </Figures>

      <div className="mt-4 border-t border-line pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-medium">
            {isToday ? "Today" : readableDay(work.day)}
          </h4>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Day</span>
            <TextInput
              type="date"
              value={day}
              min={work.since}
              max={today}
              onChange={(event) => setDay(event.target.value)}
            />
          </label>
        </div>
        <Figures>
          <Figure
            label="Vehicles onboarded"
            value={n(work.onDay.vehiclesOnboarded.total)}
            detail={split(work.onDay.vehiclesOnboarded)}
          />
          <Figure
            label="Members registered"
            value={n(work.onDay.membersRegistered)}
          />
        </Figures>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        A vehicle is onboarded once its sticker is attached.
        {work.awaitingSticker > 0
          ? ` ${n(work.awaitingSticker)} ${work.awaitingSticker === 1 ? "vehicle" : "vehicles"} you added ${work.awaitingSticker === 1 ? "has" : "have"} no sticker yet.`
          : ""}
      </p>
    </Block>
  );
}

export function DashboardCounts() {
  const { holds } = useSession();
  const readsMembers = holds("member.read");
  const readsVehicles = holds("vehicle.read");
  const readsStickers = holds("sticker.read");
  const readsReport = holds("report.read");
  // Someone who only captures in the field sees their own work, not the area's totals.
  // Overseeing is holding a permission over other officers' records.
  const oversees =
    holds("vehicle.update") || readsReport || holds("vehicle.declare");
  const capturesInField = holds("member.create") || holds("vehicle.record");
  const showsOwnWork = capturesInField && !readsReport;
  const today = lagosDay(new Date());

  const members = useSWR<{ counts: MemberCounts }>(
    readsMembers ? "/reports/member-counts" : null,
    fetcher,
  );
  const vehicles = useSWR<{ counts: VehicleCounts }>(
    readsVehicles && oversees ? "/reports/vehicle-counts" : null,
    fetcher,
  );
  // The area's stickers are other officers' numbers too (GOV-25).
  const stickers = useSWR<{ counts: StickerOriginCounts }>(
    readsStickers && oversees ? "/reports/sticker-origins" : null,
    fetcher,
  );
  const onboarding = useSWR<{ report: OnboardingReport }>(
    readsReport ? `/reports/onboarding?from=${today}&to=${today}` : null,
    fetcher,
  );

  const m = members.data?.counts;
  const v = vehicles.data?.counts;
  const s = stickers.data?.counts;
  const o = onboarding.data?.report;

  if (!m && !v && !s && !o && !showsOwnWork) {
    return null;
  }

  return (
    <section aria-labelledby="counts" className="grid gap-3">
      <h2 id="counts" className="text-sm font-medium text-muted-foreground">
        {showsOwnWork && !m && !v && !s
          ? "Your numbers"
          : "In your area of responsibility"}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {showsOwnWork ? <OwnWorkBlock today={today} /> : null}

        {v ? (
          <Block
            title="Vehicles"
            href="/vehicles/added"
            linkText="New vehicles"
          >
            <Figures>
              <Figure
                label="Onboarded"
                value={n(v.onboarded.total)}
                detail={split(v.onboarded)}
              />
              <Figure
                label="Onboarded today"
                value={n(v.onboardedToday.total)}
                detail={split(v.onboardedToday)}
              />
              <Figure
                label="Onboarded, no driver linked"
                value={n(v.onboardedWithoutMember)}
              />
              <Figure label="No sticker yet" value={n(v.withoutSticker)} />
              {v.declaration ? (
                <>
                  <Figure label="Declared" value={n(v.declaration.declared)} />
                  <Figure
                    label="Not yet declared"
                    value={n(v.declaration.notDeclared)}
                  />
                </>
              ) : null}
            </Figures>
          </Block>
        ) : null}

        {m ? (
          <Block title="Members" href="/members" linkText="Members">
            <Figures>
              <Figure label="Registered" value={n(m.registered)} />
              <Figure label="Registered today" value={n(m.registeredToday)} />
              <Figure label="Active" value={n(m.active)} />
              <Figure label="Suspended" value={n(m.suspended)} />
            </Figures>
          </Block>
        ) : null}

        {o ? (
          <Block
            title="Onboarded today"
            href="/reports/onboarding"
            linkText="Report"
          >
            <Figures>
              <Figure
                label="Vehicles onboarded"
                value={n(o.totals.vehiclesOnboarded.total)}
                detail={split(o.totals.vehiclesOnboarded)}
              />
              <Figure
                label="Members registered"
                value={n(o.totals.membersRegistered)}
              />
            </Figures>
            {o.rows.length > 0 ? (
              <ul className="mt-3 grid gap-1 border-t border-line pt-2 text-sm">
                {o.rows.map((row) => (
                  <li
                    key={row.officer.id}
                    className="flex items-baseline justify-between gap-2"
                  >
                    <span className="truncate">{row.officer.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {n(row.vehiclesOnboarded.total)}{" "}
                      {row.vehiclesOnboarded.total === 1
                        ? "vehicle"
                        : "vehicles"}
                      , {n(row.membersRegistered)}{" "}
                      {row.membersRegistered === 1 ? "member" : "members"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                No officer has onboarded anything yet today.
              </p>
            )}
          </Block>
        ) : null}

        {s ? (
          <Block title="Stickers">
            <Figures>
              <Figure
                label="Imported register, attached"
                value={
                  s.imported.total === null
                    ? n(s.imported.attached)
                    : `${n(s.imported.attached)} of ${n(s.imported.total)}`
                }
              />
              <Figure
                label="Added through the System, attached"
                value={
                  s.added.total === null
                    ? n(s.added.attached)
                    : `${n(s.added.attached)} of ${n(s.added.total)}`
                }
              />
            </Figures>
          </Block>
        ) : null}
      </div>
    </section>
  );
}
