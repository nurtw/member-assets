"use client";

import type { CardSummary } from "@nurtw/contracts";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { ErrorNotice, Select, StatusChip } from "@/components/ui";
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
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Membership cards</h1>
        <p className="mt-1 text-sm text-black/60">
          Cards within your area of responsibility. A card is prepared from an
          active member’s record on their application page.
        </p>
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

      {isLoading ? (
        <p className="text-sm text-black/50">Loading…</p>
      ) : cards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border-subtle)] p-10 text-center">
          <p className="text-sm font-medium">No cards to show</p>
          <p className="mt-1 text-sm text-black/55">
            {status
              ? "No card in your area of responsibility has that status."
              : "Cards you prepare will appear here."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-white">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)] text-left">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Holder</th>
                <th className="px-4 py-2.5 font-semibold">Card no.</th>
                <th className="px-4 py-2.5 font-semibold">Unit</th>
                <th className="px-4 py-2.5 font-semibold">Issued</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((card) => (
                <tr
                  key={card.id}
                  className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--surface-muted)]/60"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/cards/${card.id}`}
                      className="font-medium text-[var(--nurtw-navy)] underline-offset-2 hover:underline"
                    >
                      {card.member.surname}, {card.member.firstName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-black/70">
                    {/* Absent until issuance, and said so rather than left blank. */}
                    {card.cardNumber ?? (
                      <span className="font-sans italic text-black/40">
                        Not yet issued
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-black/70">
                    {card.member.organisation.name}
                  </td>
                  <td className="px-4 py-3 text-black/70">
                    {card.issueDate
                      ? new Date(card.issueDate).toLocaleDateString("en-GB")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip status={card.status} />
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
