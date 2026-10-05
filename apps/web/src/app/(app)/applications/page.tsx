"use client";

import type { ApplicationSummary } from "@nurtw/contracts";
import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import {
  EmptyState,
  ErrorNotice,
  ListToolbar,
  Loading,
  PageHeader,
  Select,
  StatusChip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  buttonVariants,
} from "@/components/ui";
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
  }>(`/applications${status ? `?status=${status}` : ""}`, fetcher, {
    keepPreviousData: true,
  });

  const applications = data?.applications ?? [];
  const apiError = error instanceof ApiError ? error : null;
  const register = holds("member.create") ? (
    <Link href="/applications/new" className={buttonVariants()}>
      <Plus aria-hidden />
      Register an applicant
    </Link>
  ) : null;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Membership applications"
        description="Applications within your area of responsibility."
        actions={register}
      />

      <ListToolbar
        count={
          data
            ? `${applications.length} ${status ? "with that status" : "in all"}`
            : undefined
        }
      >
        <div className="w-56">
          <label htmlFor="status" className="sr-only">
            Status
          </label>
          <Select
            id="status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All statuses</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </div>
      </ListToolbar>

      {apiError ? (
        <ErrorNotice message={apiError.message} requestId={apiError.requestId} />
      ) : null}

      {isLoading ? (
        <Loading />
      ) : applications.length === 0 ? (
        <EmptyState
          icon={<FileText aria-hidden />}
          title="No applications to show"
          description={
            status
              ? "No application in your area of responsibility has that status."
              : "Applications you register will appear here."
          }
          action={status ? null : register}
        />
      ) : (
        <Table stacked className="sm:min-w-[46rem]">
          <TableHead>
            <tr>
              <TableHeader>Applicant</TableHeader>
              <TableHeader>Application no.</TableHeader>
              <TableHeader>Unit</TableHeader>
              <TableHeader>Membership no.</TableHeader>
              <TableHeader>Status</TableHeader>
            </tr>
          </TableHead>
          <TableBody>
            {applications.map((application) => (
              <TableRow key={application.id}>
                <TableCell>
                  <Link
                    href={`/applications/${application.id}`}
                    className="font-medium text-link underline-offset-2 hover:underline"
                  >
                    {application.member.surname},{" "}
                    {application.member.firstName}
                  </Link>
                </TableCell>
                <TableCell
                  label="Application no."
                  className="font-mono text-xs text-muted-foreground"
                >
                  {application.applicationNumber}
                </TableCell>
                <TableCell label="Unit" className="text-muted-foreground">
                  {application.member.organisation.name}
                </TableCell>
                <TableCell
                  label="Membership no."
                  className="font-mono text-xs text-muted-foreground"
                >
                  {/* Absent until approval, and said so rather than left blank. */}
                  {application.member.membershipNumber ?? (
                    <span className="font-sans italic text-faint-foreground">
                      Not yet issued
                    </span>
                  )}
                </TableCell>
                <TableCell label="Status">
                  <StatusChip status={application.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
