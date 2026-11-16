"use client";

import type { ApplicationSummary } from "@nurtw/contracts";
import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";

import {
  EmptyState,
  ErrorNotice,
  ListToolbar,
  Loading,
  PageHeader,
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

/**
 * The registrations an officer may see (item 61: a member is active the moment a
 * registration is saved, so there is no status to filter by).
 *
 * The list the API returns is already limited to the organisation subtrees this
 * officer holds `application.read` within, and it carries no next-of-kin,
 * guarantor, telephone, or address data (PRD Requirement 7.1). Nothing here
 * filters for privacy; there is nothing to filter, which is the point.
 */
export default function ApplicationsPage() {
  const { holds } = useSession();

  const { data, error, isLoading } = useSWR<{
    applications: ApplicationSummary[];
  }>("/applications", fetcher);

  const applications = data?.applications ?? [];
  const apiError = error instanceof ApiError ? error : null;
  const register = holds("member.create") ? (
    <Link href="/applications/new" className={buttonVariants()}>
      <Plus aria-hidden />
      Register a member
    </Link>
  ) : null;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Registrations"
        description="Members registered within your area of responsibility, newest first."
        actions={register}
      />

      <ListToolbar count={data ? `${applications.length} shown` : undefined} />

      {apiError ? (
        <ErrorNotice message={apiError.message} requestId={apiError.requestId} />
      ) : null}

      {isLoading ? (
        <Loading />
      ) : applications.length === 0 ? (
        <EmptyState
          icon={<FileText aria-hidden />}
          title="No registrations to show"
          description="Members you register will appear here."
          action={register}
        />
      ) : (
        <Table stacked className="sm:min-w-[46rem]">
          <TableHead>
            <tr>
              <TableHeader>Member</TableHeader>
              <TableHeader>Registration no.</TableHeader>
              <TableHeader>Unit</TableHeader>
              <TableHeader>Membership no.</TableHeader>
              <TableHeader>Registered</TableHeader>
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
                  label="Registration no."
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
                  {/* Absent only on a registration made before item 61. */}
                  {application.member.membershipNumber ?? (
                    <span className="font-sans italic text-faint-foreground">
                      Not issued
                    </span>
                  )}
                </TableCell>
                <TableCell label="Registered" className="text-muted-foreground">
                  {new Date(application.registeredAt).toLocaleDateString("en-GB")}
                  {application.registeredBy ? ` · ${application.registeredBy}` : ""}
                </TableCell>
                <TableCell label="Status">
                  <StatusChip status={application.member.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
