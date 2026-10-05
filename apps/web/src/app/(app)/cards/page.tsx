"use client";

import type { CardSummary } from "@nurtw/contracts";
import { IdCard } from "lucide-react";
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
} from "@/components/ui";
import { ApiError, fetcher } from "@/lib/api";

const STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "ISSUED",
  "ACTIVE",
  "SUSPENDED",
  "LOST",
  "REPLACED",
  "EXPIRED",
  "CANCELLED",
];

/**
 * The cards an officer may see.
 *
 * Card-display data only. The API's card module joins none of the sensitive
 * tables, so there is no address, telephone, next of kin, or guarantor to be
 * seen here — that is structural rather than something this screen filters.
 */
export default function CardsPage() {
  const [status, setStatus] = useState("");

  const { data, error, isLoading } = useSWR<{ cards: CardSummary[] }>(
    `/cards${status ? `?status=${status}` : ""}`,
    fetcher,
    { keepPreviousData: true },
  );

  const cards = data?.cards ?? [];
  const apiError = error instanceof ApiError ? error : null;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Membership cards"
        description="Cards within your area of responsibility. A card is prepared from an active member’s record on their application page."
      />

      <ListToolbar
        count={
          data
            ? `${cards.length} ${status ? "with that status" : "in all"}`
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
      ) : cards.length === 0 ? (
        <EmptyState
          icon={<IdCard aria-hidden />}
          title="No cards to show"
          description={
            status
              ? "No card in your area of responsibility has that status."
              : "Cards you prepare will appear here. A card is prepared from an active member’s application page."
          }
        />
      ) : (
        <Table stacked className="sm:min-w-[46rem]">
          <TableHead>
            <tr>
              <TableHeader>Holder</TableHeader>
              <TableHeader>Card no.</TableHeader>
              <TableHeader>Unit</TableHeader>
              <TableHeader>Issued</TableHeader>
              <TableHeader>Status</TableHeader>
            </tr>
          </TableHead>
          <TableBody>
            {cards.map((card) => (
              <TableRow key={card.id}>
                <TableCell>
                  <Link
                    href={`/cards/${card.id}`}
                    className="font-medium text-link underline-offset-2 hover:underline"
                  >
                    {card.member.surname}, {card.member.firstName}
                  </Link>
                </TableCell>
                <TableCell
                  label="Card no."
                  className="font-mono text-xs text-muted-foreground"
                >
                  {/* Absent until issuance, and said so rather than left blank. */}
                  {card.cardNumber ?? (
                    <span className="font-sans italic text-faint-foreground">
                      Not yet issued
                    </span>
                  )}
                </TableCell>
                <TableCell label="Unit" className="text-muted-foreground">
                  {card.member.organisation.name}
                </TableCell>
                <TableCell label="Issued" className="text-muted-foreground">
                  {card.issueDate
                    ? new Date(card.issueDate).toLocaleDateString("en-GB")
                    : "—"}
                </TableCell>
                <TableCell label="Status">
                  <StatusChip status={card.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
