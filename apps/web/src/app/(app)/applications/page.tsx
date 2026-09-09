"use client";

import type { ApplicationSummary } from "@nurtw/contracts";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { ErrorNotice, Select, StatusChip } from "@/components/ui";
import { ApiError, fetcher } from "@/lib/api";
import { useSession } from "@/lib/session";

const STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
];

/**
 * The applications an officer may see.
 *
 * The list the API returns is already limited to the organisation subtrees this
 * officer holds `application.read` within, and it carries no next-of-kin,
 * guarantor, telephone, or address data (PRD Requirement 7.1). Nothing here
 * filters for privacy; there is nothing to filter, which is the point.
 */
export default function ApplicationsPage() {
  const { holds } = useSession();
  const [status, setStatus] = useState("");

  /**
   * The list, keyed by the filter.
   *
   * SWR keys on the query, so changing the filter is a new request with its own
   * cache entry rather than an effect that has to be told to re-run. Nothing
   * fetches from inside an effect body.
   */
  const { data, error, isLoading } = useSWR<{
    applications: ApplicationSummary[];
  }>(
    `/applications${status ? `?status=${status}` : ""}`,
    fetcher,
    { keepPreviousData: true },
  );

  const applications = data?.applications ?? [];
  const apiError = error instanceof ApiError ? error : null;
  const loading = isLoading;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Membership applications
          </h1>
          <p className="mt-1 text-sm text-black/60">
            Applications within your area of responsibility.
          </p>
        </div>

        {holds("member.create") ? (
          <Link
            href="/applications/new"
            className="inline-flex items-center rounded-md bg-[var(--nurtw-green)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--nurtw-green-deep)]"
          >
            Register an applicant
          </Link>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <label htmlFor="status" className="text-sm font-medium">
          Status
        </label>
        <Select
          id="status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="max-w-56"
        >
          <option value="">All</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {value.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </div>

      {apiError ? (
        <ErrorNotice message={apiError.message} requestId={apiError.requestId} />
      ) : null}

      {loading ? (
        <p className="text-sm text-black/50">Loading…</p>
      ) : applications.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border-subtle)] p-10 text-center">
          <p className="text-sm font-medium">No applications to show</p>
          <p className="mt-1 text-sm text-black/55">
            {status
              ? "No application in your area of responsibility has that status."
              : "Applications you register will appear here."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-white">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)] text-left">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Applicant</th>
                <th className="px-4 py-2.5 font-semibold">Application no.</th>
                <th className="px-4 py-2.5 font-semibold">Unit</th>
                <th className="px-4 py-2.5 font-semibold">Membership no.</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((application) => (
                <tr
                  key={application.id}
                  className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--surface-muted)]/60"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/applications/${application.id}`}
                      className="font-medium text-[var(--nurtw-navy)] underline-offset-2 hover:underline"
                    >
                      {application.member.surname},{" "}
                      {application.member.firstName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-black/70">
                    {application.applicationNumber}
                  </td>
                  <td className="px-4 py-3 text-black/70">
                    {application.member.organisation.name}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-black/70">
                    {/* Absent until approval, and said so rather than left blank. */}
                    {application.member.membershipNumber ?? (
                      <span className="font-sans italic text-black/40">
                        Not yet issued
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip status={application.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
