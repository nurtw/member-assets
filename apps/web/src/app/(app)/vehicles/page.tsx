"use client";

import type { VehicleSummary } from "@nurtw/contracts";
import { Bus, Plus } from "lucide-react";
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
  buttonVariants,
} from "@/components/ui";
import { ApiError, fetcher } from "@/lib/api";
import { useSession } from "@/lib/session";

const STATUSES = [
  "ON_RECORD",
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
  "RETIRED",
  "DISPUTED",
  "ARCHIVED",
];

/**
 * The vehicles an officer may see — declared, and on record (revision 1.3).
 *
 * No chassis or VIN and no owner details here, ever — the API's list
 * projection carries no field for either (PRD Requirements 9.4 and 9.8), so
 * there is nothing this screen could leak by forgetting to hide a column.
 */
export default function VehiclesPage() {
  const { holds } = useSession();
  // VEH-28 — the declaration status is for holders of vehicle.declare alone.
  // The API leaves it off every row the officer may not see it for; the
  // filter and the two columns go too, rather than sit empty.
  const seesDeclarations = holds("vehicle.declare");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  const params = new URLSearchParams();
  if (status && seesDeclarations) params.set("status", status);
  if (debouncedQ) params.set("q", debouncedQ);
  const queryString = params.toString();

  const { data, error, isLoading } = useSWR<{ vehicles: VehicleSummary[] }>(
    `/vehicles${queryString ? `?${queryString}` : ""}`,
    fetcher,
    { keepPreviousData: true },
  );

  const vehicles = data?.vehicles ?? [];
  const apiError = error instanceof ApiError ? error : null;
  const narrowed = Boolean(status || debouncedQ);
  const add =
    holds("vehicle.declare") || holds("vehicle.record") ? (
      <Link href="/vehicles/new" className={buttonVariants()}>
        <Plus aria-hidden />
        {holds("vehicle.declare") ? "Declare a vehicle" : "Record a vehicle"}
      </Link>
    ) : null;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Vehicles"
        description={
          seesDeclarations
            ? "Vehicles within your area of responsibility, declared and on record. A declaration is never created by a verification enquiry — only through this screen."
            : "Vehicles within your area of responsibility."
        }
        actions={add}
      />

      <ListToolbar
        count={
          data
            ? `${vehicles.length} ${narrowed ? "matching" : "shown"}`
            : undefined
        }
      >
        <div className="min-w-48 flex-1 sm:max-w-xs">
          <label htmlFor="q" className="sr-only">
            Search by plate number
          </label>
          <TextInput
            id="q"
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search by plate number"
          />
        </div>

        {seesDeclarations ? (
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
        ) : null}
      </ListToolbar>

      {apiError ? (
        <ErrorNotice message={apiError.message} requestId={apiError.requestId} />
      ) : null}

      {isLoading ? (
        <Loading />
      ) : vehicles.length === 0 ? (
        <EmptyState
          icon={<Bus aria-hidden />}
          title="No vehicles to show"
          description={
            narrowed
              ? "No vehicle in your area of responsibility matches that search."
              : "Vehicles in your area of responsibility will appear here."
          }
          action={narrowed ? null : add}
        />
      ) : (
        <Table stacked className="sm:min-w-[52rem]">
          <TableHead>
            <tr>
              <TableHeader>Plate</TableHeader>
              <TableHeader>Type</TableHeader>
              <TableHeader>Route</TableHeader>
              <TableHeader>Organisation</TableHeader>
              <TableHeader>Driver</TableHeader>
              {seesDeclarations ? (
                <>
                  <TableHeader>Declared</TableHeader>
                  <TableHeader>Status</TableHeader>
                </>
              ) : null}
            </tr>
          </TableHead>
          <TableBody>
            {vehicles.map((vehicle) => (
              <TableRow key={vehicle.id}>
                <TableCell>
                  <Link
                    href={`/vehicles/${vehicle.id}`}
                    className="font-mono text-sm font-medium text-link underline-offset-2 hover:underline"
                  >
                    {vehicle.plateNumberDisplay}
                  </Link>
                  {vehicle.isLegacyImport ? (
                    <span className="ml-2 text-xs italic text-faint-foreground">
                      legacy
                    </span>
                  ) : null}
                </TableCell>
                <TableCell label="Type" className="text-muted-foreground">
                  {vehicle.vehicleCategory?.label ?? "—"}
                </TableCell>
                <TableCell label="Route" className="text-muted-foreground">
                  {vehicle.routeType?.label ?? "—"}
                </TableCell>
                <TableCell
                  label="Organisation"
                  className="text-muted-foreground"
                >
                  {vehicle.organisation.name}
                </TableCell>
                <TableCell label="Driver" className="text-muted-foreground">
                  {vehicle.declaredByMember
                    ? `${vehicle.declaredByMember.surname}, ${vehicle.declaredByMember.firstName}`
                    : "—"}
                </TableCell>
                {seesDeclarations ? (
                  <>
                    {/* A row outside the officer's declare scope carries
                        neither field: a dash, never "not declared". */}
                    <TableCell
                      label="Declared"
                      className="text-muted-foreground"
                    >
                      {vehicle.status === undefined
                        ? "—"
                        : vehicle.declaredAt
                          ? new Date(vehicle.declaredAt).toLocaleDateString(
                              "en-GB",
                            )
                          : "Not yet declared"}
                    </TableCell>
                    <TableCell label="Status">
                      {vehicle.status ? (
                        <StatusChip status={vehicle.status} />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
