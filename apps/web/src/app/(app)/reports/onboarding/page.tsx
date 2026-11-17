"use client";

import type { OnboardingReport } from "@nurtw/contracts";
import { ClipboardList } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import {
  EmptyState,
  ErrorNotice,
  ListToolbar,
  Loading,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TextInput,
} from "@/components/ui";
import { ApiError, fetcher } from "@/lib/api";
import { lagosDay, lagosDaysBefore, readableDay } from "@/lib/lagos-day";

/**
 * How many were onboarded each day, and by which officer (item 66,
 * `QUESTIONS.md` GOV-25, still open: built to its recommendation). Counts of what
 * the System recorded: members registered through it (so not the imported ones),
 * vehicles recorded and declared, and stickers attached. By the officer's name, over
 * the records in the reader's own area of responsibility. At most 92 days.
 */
export default function OnboardingReportPage() {
  const now = new Date();
  const [from, setFrom] = useState(lagosDaysBefore(now, 13));
  const [to, setTo] = useState(lagosDay(now));

  const { data, error, isLoading } = useSWR<{ report: OnboardingReport }>(
    from && to ? `/reports/onboarding?from=${from}&to=${to}` : null,
    fetcher,
    { keepPreviousData: true },
  );
  const apiError = error instanceof ApiError ? error : null;
  const report = data?.report;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Onboarding report"
        description="How many members were registered, vehicles recorded and declared, and stickers attached each day, and by which officer. Members and vehicles that came with the imported register are not counted."
      />

      <ListToolbar
        count={report ? `${report.rows.length} ${report.rows.length === 1 ? "line" : "lines"}` : undefined}
      >
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <label htmlFor="from">From</label>
          <TextInput
            id="from"
            type="date"
            value={from}
            max={to}
            onChange={(event) => setFrom(event.target.value)}
          />
          <label htmlFor="to">to</label>
          <TextInput
            id="to"
            type="date"
            value={to}
            min={from}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
      </ListToolbar>

      {apiError ? (
        <ErrorNotice
          message={
            apiError.status === 400
              ? "Choose real days, the first before the last, and no more than 92 days."
              : apiError.message
          }
          requestId={apiError.requestId}
        />
      ) : null}

      {isLoading && !report ? (
        <Loading />
      ) : report && report.rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardList aria-hidden />}
          title="Nothing was onboarded"
          description="No member, vehicle, or sticker was taken on in those days, in your area of responsibility."
        />
      ) : report ? (
        <Table stacked className="sm:min-w-[40rem]">
          <TableHead>
            <tr>
              <TableHeader>Day</TableHeader>
              <TableHeader>Officer</TableHeader>
              <TableHeader>Members registered</TableHeader>
              <TableHeader>Vehicles recorded</TableHeader>
              <TableHeader>Vehicles declared</TableHeader>
              <TableHeader>Stickers attached</TableHeader>
            </tr>
          </TableHead>
          <TableBody>
            {report.rows.map((row) => (
              <TableRow key={`${row.day}-${row.officer.id}`}>
                <TableCell>{readableDay(row.day)}</TableCell>
                <TableCell label="Officer">{row.officer.name}</TableCell>
                <TableCell label="Members registered" className="tabular-nums">
                  {row.membersRegistered}
                </TableCell>
                <TableCell label="Vehicles recorded" className="tabular-nums">
                  {row.vehiclesRecorded}
                </TableCell>
                <TableCell label="Vehicles declared" className="tabular-nums">
                  {row.vehiclesDeclared}
                </TableCell>
                <TableCell label="Stickers attached" className="tabular-nums">
                  {row.stickersAttached}
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-semibold">Total</TableCell>
              <TableCell label="Officer">—</TableCell>
              <TableCell label="Members registered" className="font-semibold tabular-nums">
                {report.totals.membersRegistered}
              </TableCell>
              <TableCell label="Vehicles recorded" className="font-semibold tabular-nums">
                {report.totals.vehiclesRecorded}
              </TableCell>
              <TableCell label="Vehicles declared" className="font-semibold tabular-nums">
                {report.totals.vehiclesDeclared}
              </TableCell>
              <TableCell label="Stickers attached" className="font-semibold tabular-nums">
                {report.totals.stickersAttached}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
