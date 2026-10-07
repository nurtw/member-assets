"use client";

import { MEMBER_LIST_MAXIMUM, type MemberSearchResult } from "@nurtw/contracts";
import { Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
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
  TextInput,
} from "@/components/ui";
import { ApiError, fetcher } from "@/lib/api";

/**
 * Who is, or was, a member. A pending applicant is not one yet and stays on
 * Applications, so the list never asks for that status.
 */
const MEMBER_STATUSES = ["ACTIVE", "SUSPENDED", "CANCELLED"] as const;

/**
 * The members an officer may see (item 37).
 *
 * The first screen that lists members and not applications, so a migrated
 * member, who has no application, can be found and opened. The API limits the
 * list to the organisations this officer holds `member.read` within, and its
 * rows carry no contact, next-of-kin, or guarantor data (PRD Requirement 7.1).
 *
 * It is an officer's list. The System is not a directory, and nothing here is
 * offered to anybody outside the Union.
 */
export default function MembersPage() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  const params = new URLSearchParams();
  params.set("status", status || MEMBER_STATUSES.join(","));
  params.set("limit", String(MEMBER_LIST_MAXIMUM));
  if (debouncedQ) params.set("q", debouncedQ);

  const { data, error, isLoading } = useSWR<{ members: MemberSearchResult[] }>(
    `/members?${params.toString()}`,
    fetcher,
    { keepPreviousData: true },
  );

  const members = data?.members ?? [];
  const apiError = error instanceof ApiError ? error : null;
  const narrowed = Boolean(status || debouncedQ);
  // The list stops at the maximum, and says so instead of looking complete.
  const cut = members.length >= MEMBER_LIST_MAXIMUM;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Members"
        description="Members within your area of responsibility. An applicant who has not been approved is under Applications."
      />

      <ListToolbar
        count={
          data
            ? cut
              ? `The first ${MEMBER_LIST_MAXIMUM}. Search to narrow the list.`
              : `${members.length} ${narrowed ? "matching" : "in all"}`
            : undefined
        }
      >
        <div className="min-w-48 flex-1 sm:max-w-xs">
          <label htmlFor="q" className="sr-only">
            Search by name or membership number
          </label>
          <TextInput
            id="q"
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search by name or membership number"
          />
        </div>

        <div className="w-56">
          <label htmlFor="status" className="sr-only">
            Status
          </label>
          <Select
            id="status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All members</option>
            {MEMBER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value.charAt(0) + value.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </div>
      </ListToolbar>

      {apiError ? (
        <ErrorNotice
          message={apiError.message}
          requestId={apiError.requestId}
        />
      ) : null}

      {isLoading ? (
        <Loading />
      ) : members.length === 0 ? (
        <EmptyState
          icon={<Users aria-hidden />}
          title="No members to show"
          description={
            narrowed
              ? "No member in your area of responsibility matches that search."
              : "Members in your area of responsibility will appear here."
          }
        />
      ) : (
        <Table stacked className="sm:min-w-[40rem]">
          <TableHead>
            <tr>
              <TableHeader>Member</TableHeader>
              <TableHeader>Membership no.</TableHeader>
              <TableHeader>Unit</TableHeader>
              <TableHeader>Status</TableHeader>
            </tr>
          </TableHead>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell>
                  <Link
                    href={`/members/${member.id}`}
                    className="font-medium text-link underline-offset-2 hover:underline"
                  >
                    {member.surname}, {member.firstName}
                  </Link>
                </TableCell>
                <TableCell
                  label="Membership no."
                  className="font-mono text-xs text-muted-foreground"
                >
                  {member.membershipNumber ?? "—"}
                </TableCell>
                <TableCell label="Unit" className="text-muted-foreground">
                  {member.organisation.name}
                </TableCell>
                <TableCell label="Status">
                  <StatusChip status={member.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
