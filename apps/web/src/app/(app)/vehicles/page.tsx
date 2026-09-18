"use client";

import type { VehicleSummary } from "@nurtw/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";

import { Button, ErrorNotice, Select, StatusChip, TextInput } from "@/components/ui";
import { ApiError, fetcher } from "@/lib/api";
import { useSession } from "@/lib/session";

const STATUSES = ["PENDING", "ACTIVE", "SUSPENDED", "RETIRED", "DISPUTED", "ARCHIVED"];

/**
 * The declarations an officer may see.
 *
 * No chassis or VIN here, ever — the API's list projection carries no field
 * for it (PRD Requirement 9.4), so there is nothing this screen could leak
 * by forgetting to hide a column.
 */
export default function VehiclesPage() {
  const { holds } = useSession();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (debouncedQ) params.set("q", debouncedQ);
  const queryString = params.toString();

  const { data, error, isLoading } = useSWR<{ vehicles: VehicleSummary[] }>(
    `/vehicles${queryString ? `?${queryString}` : ""}`,
    fetcher,
    { keepPreviousData: true },
  );

  const vehicles = data?.vehicles ?? [];
  const apiError = error instanceof ApiError ? error : null;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Vehicle declarations
          </h1>
          <p className="mt-1 text-sm text-black/60">
            Declarations within your area of responsibility. A declaration is
            never created by a verification enquiry — only through this
            screen.
          </p>
        </div>
        {holds("vehicle.declare") ? (
          <Link href="/vehicles/new">
            <Button type="button">Declare a vehicle</Button>
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="q" className="text-sm font-medium">
          Plate number
        </label>
        <TextInput
          id="q"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search"
          className="max-w-56"
        />

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
      ) : vehicles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border-subtle)] p-10 text-center">
          <p className="text-sm font-medium">No declarations to show</p>
          <p className="mt-1 text-sm text-black/55">
            {status || debouncedQ
              ? "No declaration in your area of responsibility matches that search."
              : "Vehicles declared in your area of responsibility will appear here."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-white">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)] text-left">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Plate</th>
                <th className="px-4 py-2.5 font-semibold">Category</th>
                <th className="px-4 py-2.5 font-semibold">Organisation</th>
                <th className="px-4 py-2.5 font-semibold">Owner</th>
                <th className="px-4 py-2.5 font-semibold">Declared</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((vehicle) => (
                <tr
                  key={vehicle.id}
                  className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--surface-muted)]/60"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/vehicles/${vehicle.id}`}
                      className="font-mono text-sm font-medium text-[var(--nurtw-navy)] underline-offset-2 hover:underline"
                    >
                      {vehicle.plateNumberDisplay}
                    </Link>
                    {vehicle.isLegacyImport ? (
                      <span className="ml-2 text-xs italic text-black/40">
                        legacy
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-black/70">
                    {vehicle.vehicleCategory?.label ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-black/70">
                    {vehicle.organisation.name}
                  </td>
                  <td className="px-4 py-3 text-black/70">
                    {vehicle.declaredByMember
                      ? `${vehicle.declaredByMember.surname}, ${vehicle.declaredByMember.firstName}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-black/70">
                    {new Date(vehicle.declaredAt).toLocaleDateString("en-GB")}
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip status={vehicle.status} />
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
