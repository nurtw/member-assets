"use client";

import type { AddedVehiclesResponse } from "@nurtw/contracts";
import { Bus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";

import {
  Button,
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

const PAGE = 50;

/**
 * The vehicles added through the System, apart from the imported ones (item 65,
 * `QUESTIONS.md` VEH-42). Plate, type, branch or unit, who recorded it and when,
 * and its sticker, for anyone who may read vehicles. Whether it is declared, the
 * owner's name, and the chassis number appear only where the API sends them, which
 * it does for `vehicle.declare` and `vehicle.read_restricted` alone. A telephone or
 * an address is in no list: the API does not select them.
 */
export default function AddedVehiclesPage() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
  if (debouncedQ) params.set("q", debouncedQ);
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const { data, error, isLoading } = useSWR<AddedVehiclesResponse>(
    `/reports/added-vehicles?${params.toString()}`,
    fetcher,
    { keepPreviousData: true },
  );
  const apiError = error instanceof ApiError ? error : null;
  const vehicles = data?.vehicles ?? [];
  const total = data?.total ?? 0;
  const showsDeclared = vehicles.some((vehicle) => "declared" in vehicle);
  const showsRestricted = vehicles.some((vehicle) => "owner" in vehicle);
  const narrowed = Boolean(debouncedQ || from || to);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="New vehicles"
        description="Vehicles added through the System, apart from those that came with the imported register."
        back={{ href: "/vehicles", label: "Vehicles" }}
      />

      <ListToolbar
        count={data ? `${total.toLocaleString("en-GB")} ${narrowed ? "matching" : "in all"}` : undefined}
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
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <label htmlFor="from">From</label>
          <TextInput
            id="from"
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setOffset(0);
            }}
          />
          <label htmlFor="to">to</label>
          <TextInput
            id="to"
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setOffset(0);
            }}
          />
        </div>
      </ListToolbar>

      {apiError ? (
        <ErrorNotice message={apiError.message} requestId={apiError.requestId} />
      ) : null}

      {isLoading ? (
        <Loading />
      ) : vehicles.length === 0 ? (
        <EmptyState
          icon={<Bus aria-hidden />}
          title="No new vehicles to show"
          description={
            narrowed
              ? "No vehicle added through the System matches that."
              : "Vehicles added through the System in your area of responsibility will appear here."
          }
        />
      ) : (
        <>
          <Table stacked className="sm:min-w-[52rem]">
            <TableHead>
              <tr>
                <TableHeader>Plate</TableHeader>
                <TableHeader>Type</TableHeader>
                <TableHeader>Branch or unit</TableHeader>
                <TableHeader>Recorded by</TableHeader>
                <TableHeader>Recorded</TableHeader>
                <TableHeader>Sticker</TableHeader>
                {showsDeclared ? <TableHeader>Declared</TableHeader> : null}
                {showsRestricted ? (
                  <>
                    <TableHeader>Owner</TableHeader>
                    <TableHeader>Chassis / VIN</TableHeader>
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
                      {vehicle.plate}
                    </Link>
                  </TableCell>
                  <TableCell label="Type" className="text-muted-foreground">
                    {vehicle.category ?? "—"}
                  </TableCell>
                  <TableCell label="Branch or unit" className="text-muted-foreground">
                    {vehicle.organisation.name}
                  </TableCell>
                  <TableCell label="Recorded by" className="text-muted-foreground">
                    {vehicle.recordedBy ?? "—"}
                  </TableCell>
                  <TableCell label="Recorded" className="text-muted-foreground">
                    {new Date(vehicle.recordedAt).toLocaleDateString("en-GB")}
                  </TableCell>
                  <TableCell label="Sticker" className="text-muted-foreground">
                    {vehicle.sticker.attached ? "Attached" : "Not yet"}
                  </TableCell>
                  {showsDeclared ? (
                    <TableCell label="Declared" className="text-muted-foreground">
                      {"declared" in vehicle ? (vehicle.declared ? "Yes" : "No") : "—"}
                    </TableCell>
                  ) : null}
                  {showsRestricted ? (
                    <>
                      <TableCell label="Owner" className="text-muted-foreground">
                        {"owner" in vehicle ? (vehicle.owner ?? "—") : "—"}
                      </TableCell>
                      <TableCell label="Chassis / VIN" className="font-mono text-muted-foreground">
                        {"chassis" in vehicle ? (vehicle.chassis ?? "—") : "—"}
                      </TableCell>
                    </>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Button
              type="button"
              variant="secondary"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE))}
            >
              Previous
            </Button>
            <span>
              {(offset + 1).toLocaleString("en-GB")} to{" "}
              {Math.min(offset + PAGE, total).toLocaleString("en-GB")} of{" "}
              {total.toLocaleString("en-GB")}
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={offset + PAGE >= total}
              onClick={() => setOffset(offset + PAGE)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
