"use client";

import type {
  MemberCounts,
  OnboardingReport,
  OwnWork,
  StickerOriginCounts,
  VehicleCounts,
} from "@nurtw/contracts";
import Link from "next/link";
import type { ReactNode } from "react";
import useSWR from "swr";

import { fetcher } from "@/lib/api";
import { lagosDay } from "@/lib/lagos-day";
import { useSession } from "@/lib/session";

/**
 * The counts on Home (item 67, `QUESTIONS.md` GOV-25, answered 17 November 2026).
 *
 * The owner accepted this shape for each role:
 *
 * - **Administrators, the auditor, and the super administrator** see the area's members,
 *   vehicles, stickers, and the onboarding report with each officer's name. The super
 *   administrator also sees the vehicles not yet declared, which is their working backlog.
 * - **The vehicle-record officer** sees the area's vehicles, with those that have no sticker yet.
 * - **The field enumerator** sees **only their own work**, and no one else's numbers.
 * - **The card administrator** sees what waits for them, above this.
 *
 * A block is offered only to an officer who holds the permission that opens the matching
 * list, and the API counts only inside the organisations where they hold it, so a count
 * never shows more than a list would. The declared figures appear only if the API sends
 * them (VEH-28, VEH-43). Nothing here polls: the figures load when Home opens, and again
 * when the tab is used after a while.
 */

function Figure({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Block({
  title,
  href,
  linkText,
  children,
}: {
  title: string;
  href?: string;
  linkText?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-2xl border border-line bg-surface p-4 shadow-card"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {href ? (
          <Link href={href} className="text-xs text-link underline-offset-2 hover:underline">
            {linkText ?? "Open"}
          </Link>
        ) : null}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">{children}</dl>
    </section>
  );
}

const n = (value: number) => value.toLocaleString("en-GB");

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
  const today = lagosDay(new Date());

  const members = useSWR<{ counts: MemberCounts }>(
    readsMembers ? "/reports/member-counts" : null,
    fetcher,
  );
  const vehicles = useSWR<{ counts: VehicleCounts }>(
    readsVehicles && oversees ? "/reports/vehicle-counts" : null,
    fetcher,
  );
  const stickers = useSWR<{ counts: StickerOriginCounts }>(
    readsStickers ? "/reports/sticker-origins" : null,
    fetcher,
  );
  const work = useSWR<{ work: OwnWork }>(
    capturesInField && !readsReport ? "/reports/my-work" : null,
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
  // The onboarding block already shows an administrator's own numbers with everyone's.
  const w = work.data?.work;

  if (!m && !v && !s && !o && !w) {
    return null;
  }

  return (
    <section aria-labelledby="counts" className="grid gap-3">
      <h2 id="counts" className="text-sm font-medium text-muted-foreground">
        In your area of responsibility
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {m ? (
          <Block title="Members" href="/members" linkText="Members">
            <Figure label="Active" value={n(m.active)} />
            <Figure label="Suspended" value={n(m.suspended)} />
            <Figure label="Registered today" value={n(m.registeredToday)} />
            <Figure label="Last 7 days" value={n(m.registeredLastSevenDays)} />
          </Block>
        ) : null}

        {v ? (
          <Block title="Vehicles" href="/vehicles/added" linkText="New vehicles">
            <Figure label="Vehicles" value={n(v.total)} />
            <Figure label="Added through the System" value={n(v.addedThroughSystem)} />
            <Figure label="Added today" value={n(v.addedToday)} />
            <Figure label="With no sticker yet" value={n(v.withoutSticker)} />
            {v.declaration ? (
              <>
                <Figure label="Not yet declared" value={n(v.declaration.notDeclared)} />
                <Figure label="Declared" value={n(v.declaration.declared)} />
              </>
            ) : null}
          </Block>
        ) : null}

        {s ? (
          <Block title="Stickers">
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
          </Block>
        ) : null}

        {w ? (
          <Block title="Your work">
            <Figure label="Members registered today" value={n(w.today.membersRegistered)} />
            <Figure label="Vehicles recorded today" value={n(w.today.vehiclesRecorded)} />
            <Figure label="Stickers attached today" value={n(w.today.stickersAttached)} />
            <Figure
              label="Last 7 days"
              value={`${n(w.lastSevenDays.membersRegistered)} members, ${n(w.lastSevenDays.vehiclesRecorded)} vehicles`}
            />
          </Block>
        ) : null}

        {o ? (
          <Block title="Onboarded today" href="/reports/onboarding" linkText="Report">
            <Figure label="Members registered" value={n(o.totals.membersRegistered)} />
            <Figure label="Vehicles recorded" value={n(o.totals.vehiclesRecorded)} />
            <Figure label="Vehicles declared" value={n(o.totals.vehiclesDeclared)} />
            <Figure label="Stickers attached" value={n(o.totals.stickersAttached)} />
          </Block>
        ) : null}
      </div>
    </section>
  );
}
