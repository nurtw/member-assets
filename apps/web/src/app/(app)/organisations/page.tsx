"use client";

import type { ApiClientList, ApiClientSummary } from "@nurtw/contracts";
import { Building2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";

import { moment, shortDay } from "@/components/api-access";
import { OrganisationsHeader } from "@/components/organisations-header";
import {
  EmptyState,
  ErrorNotice,
  Notice,
  Select,
  Skeleton,
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
import { useSession } from "@/lib/session";

/**
 * Outside organisations and their API access (PRD §12.1, item 11; a page of
 * their own since item 33).
 *
 * An organisation comes to be here in three ways: an officer registers it, it
 * applies for itself through the portal, or it applies through an invitation.
 * However it came, it is pending until an officer approves it with a
 * disclosure profile, scopes, and a data-sharing agreement, and it holds no
 * token until one is issued.
 */

const FILTERS = [
  { value: "", label: "All organisations" },
  { value: "PENDING", label: "Awaiting a decision" },
  { value: "ACTIVE", label: "Active" },
  { value: "EXPIRED", label: "Token expired" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "REVOKED", label: "Access withdrawn" },
  { value: "PAUSED", label: "Paused" },
];

/** How it came to be on the list, and when. */
function origin(client: ApiClientSummary): string {
  const day = shortDay(client.createdAt);
  if (client.invited) {
    return `Invited, applied ${day}`;
  }
  return client.selfRegistered
    ? `Applied ${day} through the portal`
    : `Registered ${day}`;
}

function matches(client: ApiClientSummary, filter: string): boolean {
  if (filter === "") {
    return true;
  }
  return filter === "PAUSED"
    ? client.pausedUntil !== null
    : client.status === filter;
}

function Mentions({
  clients,
  after,
}: {
  clients: ApiClientSummary[];
  after: (client: ApiClientSummary) => string;
}) {
  return (
    <ul className="mt-2 list-disc pl-5">
      {clients.map((client) => (
        <li key={client.id}>
          <Link
            href={`/organisations/${client.id}`}
            className="font-medium underline underline-offset-2"
          >
            {client.organisationName}
          </Link>{" "}
          {after(client)}
        </li>
      ))}
    </ul>
  );
}

export default function OrganisationsPage() {
  const router = useRouter();
  const { holds } = useSession();
  const canRead = holds("api_client.read");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");

  // An officer who may read profiles but not organisations is sent to the
  // profiles, rather than shown a refusal.
  useEffect(() => {
    if (!canRead && holds("disclosure_profile.read")) {
      router.replace("/organisations/profiles");
    }
  }, [canRead, holds, router]);

  const { data, error, isLoading } = useSWR<ApiClientList>(
    canRead ? "/api-clients" : null,
    fetcher,
  );

  const clients = data?.clients ?? [];
  const loadError = error instanceof ApiError ? error : null;
  const expiring = clients.filter(
    (client) => client.currentToken?.expiringSoon,
  );
  const paused = clients.filter((client) => client.pausedUntil !== null);
  // Organisations that applied for themselves and await a decision (item 29).
  const applied = clients.filter(
    (client) => client.selfRegistered && client.status === "PENDING",
  );
  const wanted = search.trim().toLowerCase();
  const shown = clients.filter(
    (client) =>
      matches(client, filter) &&
      (wanted === "" || client.organisationName.toLowerCase().includes(wanted)),
  );

  return (
    <div className="grid max-w-5xl gap-6">
      <OrganisationsHeader />

      {loadError ? (
        <ErrorNotice
          message={loadError.message}
          requestId={loadError.requestId}
        />
      ) : null}

      {applied.length > 0 ? (
        <Notice tone="caution" title="Applications awaiting a decision">
          These organisations applied for themselves and can do nothing yet.
          Confirm each applicant by telephone or letter, then approve or refuse
          it. An application left undecided lapses after 30 days.
          <Mentions
            clients={applied}
            after={(client) =>
              `— ${client.invited ? "invited, applied" : "applied"} ${shortDay(client.createdAt)}`
            }
          />
        </Notice>
      ) : null}

      {paused.length > 0 ? (
        <Notice tone="deny" title="Paused by abuse detection">
          The System is refusing these organisations’ requests for a time,
          because their checks followed a pattern. Open one to see why, and to
          lift the pause or suspend it.
          <Mentions
            clients={paused}
            after={(client) => `— until ${moment(client.pausedUntil)}`}
          />
        </Notice>
      ) : null}

      {expiring.length > 0 ? (
        <Notice tone="caution" title="Tokens to replace soon">
          These expire within {data?.reminderDays} days. Replace each one and
          pass the new token to the organisation’s technical contact before the
          old one stops working.
          <Mentions
            clients={expiring}
            after={(client) =>
              `— expires ${shortDay(client.currentToken?.expiresAt ?? null)}`
            }
          />
        </Notice>
      ) : null}

      {isLoading ? (
        <div className="grid gap-2" role="status" aria-label="Loading">
          <Skeleton className="h-10" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : canRead && clients.length === 0 && !loadError ? (
        <EmptyState
          icon={<Building2 aria-hidden />}
          title="No organisations yet"
          description="Invite an organisation to apply, or register one the Union already knows. Either way it is pending until it is approved."
        />
      ) : clients.length > 0 ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1 sm:max-w-xs">
              <label htmlFor="organisationSearch" className="sr-only">
                Search organisations by name
              </label>
              <TextInput
                id="organisationSearch"
                type="search"
                placeholder="Search by name"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="w-56">
              <label htmlFor="organisationFilter" className="sr-only">
                Show
              </label>
              <Select
                id="organisationFilter"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                {FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <p className="ml-auto text-sm text-muted-foreground" role="status">
              {shown.length === clients.length
                ? `${clients.length} in all`
                : `${shown.length} of ${clients.length}`}
            </p>
          </div>

          {shown.length === 0 ? (
            <EmptyState
              title="None match"
              description="No organisation has that name and standing. Clear the search or choose All organisations."
            />
          ) : (
            <Table className="min-w-[52rem]">
              <TableHead>
                <tr>
                  <TableHeader>Organisation</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Profile</TableHeader>
                  <TableHeader>Scopes</TableHeader>
                  <TableHeader>Token</TableHeader>
                </tr>
              </TableHead>
              <TableBody>
                {shown.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell>
                      <Link
                        href={`/organisations/${client.id}`}
                        className="font-medium text-link underline-offset-2 hover:underline"
                      >
                        {client.organisationName}
                      </Link>
                      <span className="block text-xs text-faint-foreground">
                        {origin(client)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusChip status={client.status} />
                      {client.pausedUntil ? (
                        <span className="mt-1 block text-xs font-semibold text-verdict-deny">
                          Paused until {moment(client.pausedUntil)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {client.disclosureProfile?.label ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {client.scopes.length === 0 ? "—" : client.scopes.length}
                    </TableCell>
                    <TableCell>
                      {client.currentToken ? (
                        <>
                          <span className="font-mono text-xs">
                            {client.currentToken.prefix}…
                          </span>
                          <span className="block text-xs text-faint-foreground">
                            {client.currentToken.expiringSoon
                              ? "Replace soon · "
                              : ""}
                            expires {shortDay(client.currentToken.expiresAt)}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs italic text-faint-foreground">
                          None in use
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      ) : null}
    </div>
  );
}
