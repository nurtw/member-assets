"use client";

import type { OnboardedVehicles, OnboardingReport } from "@nurtw/contracts";
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

/** The total first, and the legacy and new split beneath it. */
function Onboarded({ vehicles }: { vehicles: OnboardedVehicles }) {
  return (
    <span className="grid">
      <span>{vehicles.total}</span>
      <span className="text-xs font-normal text-muted-foreground">
        {vehicles.imported} legacy · {vehicles.added} new
      </span>
    </span>
  );
}

/**
 * How many were onboarded each day, and by which officer (item 66, `QUESTIONS.md`
 * GOV-25 and GOV-26). A vehicle is onboarded on the day its first sticker is attached,
 * legacy or new, by the officer who attached it; the total comes first and the split
 * beneath. Also members registered through the System (so not the imported ones), and
 * vehicles added. Nothing about declaring. By the officer's name, over the records in
 * the reader's own area of responsibility. At most 92 days.
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
        description="How many vehicles each officer onboarded each day, and how many members they registered. A vehicle is onboarded once its sticker is attached, whether it is a legacy vehicle or a new one. Members who came with the imported register are not counted."
      />

      <ListToolbar
        count={
          report
            ? `${report.rows.length} ${report.rows.length === 1 ? "line" : "lines"}`
            : undefined
        }
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
          description="No vehicle was onboarded and no member registered in those days, in your area of responsibility."
        />
      ) : report ? (
        <Table stacked className="sm:min-w-[40rem]">
          <TableHead>
            <tr>
              <TableHeader>Day</TableHeader>
              <TableHeader>Officer</TableHeader>
              <TableHeader>Vehicles onboarded</TableHeader>
              <TableHeader>Members registered</TableHeader>
              <TableHeader>Vehicles added</TableHeader>
            </tr>
          </TableHead>
          <TableBody>
            {report.rows.map((row) => (
              <TableRow key={`${row.day}-${row.officer.id}`}>
                <TableCell>{readableDay(row.day)}</TableCell>
                <TableCell label="Officer">{row.officer.name}</TableCell>
                <TableCell label="Vehicles onboarded" className="tabular-nums">
                  <Onboarded vehicles={row.vehiclesOnboarded} />
                </TableCell>
                <TableCell label="Members registered" className="tabular-nums">
                  {row.membersRegistered}
                </TableCell>
                <TableCell label="Vehicles added" className="tabular-nums">
                  {row.vehiclesRecorded}
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-semibold">Total</TableCell>
              <TableCell label="Officer">—</TableCell>
              <TableCell
                label="Vehicles onboarded"
                className="font-semibold tabular-nums"
              >
                <Onboarded vehicles={report.totals.vehiclesOnboarded} />
              </TableCell>
              <TableCell
                label="Members registered"
                className="font-semibold tabular-nums"
              >
                {report.totals.membersRegistered}
              </TableCell>
              <TableCell
                label="Vehicles added"
                className="font-semibold tabular-nums"
              >
                {report.totals.vehiclesRecorded}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
