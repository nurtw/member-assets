"use client";

import {
  BULK_DECLARE_LIMIT,
  type DeclareManyVehiclesResult,
  type VehicleSummary,
} from "@nurtw/contracts";
import { Bus, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

import {
  Button,
  EmptyState,
  ErrorNotice,
  ListToolbar,
  Loading,
  Notice,
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError, api, fetcher } from "@/lib/api";
import { chunk, isTickable, skipWords } from "@/lib/bulk-declare";
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
  // Item 63: bulk declaration. Ticks are ids; what is acted on is always the ticked
  // rows that are still shown and still declarable.
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<{
    declared: number;
    skipped: DeclareManyVehiclesResult["skipped"];
  } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  const params = new URLSearchParams();
  if (status && seesDeclarations) params.set("status", status);
  if (debouncedQ) params.set("q", debouncedQ);
  const queryString = params.toString();

  const { data, error, isLoading, mutate } = useSWR<{
    vehicles: VehicleSummary[];
  }>(
    `/vehicles${queryString ? `?${queryString}` : ""}`,
    fetcher,
    { keepPreviousData: true },
  );

  const vehicles = data?.vehicles ?? [];
  // Only the super administrator holds `vehicle.declare` (VEH-43).
  const canTick = seesDeclarations;
  const tickable = canTick ? vehicles.filter(isTickable) : [];
  const chosen = tickable.filter((vehicle) => ticked.has(vehicle.id));
  const allTicked = tickable.length > 0 && chosen.length === tickable.length;

  function toggle(id: string) {
    const next = new Set(ticked);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setTicked(next);
  }

  /** Declares the ticked vehicles, in requests the API accepts. */
  async function declareChosen() {
    const ids = chosen.map((vehicle) => vehicle.id);
    let declared = 0;
    const skipped: DeclareManyVehiclesResult["skipped"] = [];
    try {
      for (const part of chunk(ids, BULK_DECLARE_LIMIT)) {
        setProgress(`Declared ${declared + skipped.length} of ${ids.length}…`);
        const answer = await api.post<DeclareManyVehiclesResult>(
          "/vehicles/declare-many",
          { vehicleIds: part },
        );
        declared += answer.declared;
        skipped.push(...answer.skipped);
      }
    } finally {
      // Whatever was done is shown, even when a later request failed.
      setProgress(null);
      setResult({ declared, skipped });
      setTicked(new Set());
      await mutate();
    }
    toast.success(
      `${declared} ${declared === 1 ? "vehicle" : "vehicles"} declared`,
    );
  }
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
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/vehicles/added"
              className={buttonVariants({ variant: "secondary" })}
            >
              New vehicles
            </Link>
            {add}
          </div>
        }
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

        {canTick && tickable.length > 0 ? (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-line accent-primary"
              checked={allTicked}
              onChange={() =>
                setTicked(
                  allTicked
                    ? new Set()
                    : new Set(tickable.map((vehicle) => vehicle.id)),
                )
              }
            />
            Select all {tickable.length} that can be declared
          </label>
        ) : null}

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

      {chosen.length > 0 ? (
        <div
          role="region"
          aria-label="Declare the ticked vehicles"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-muted px-4 py-3 text-sm"
        >
          <span>
            {chosen.length} {chosen.length === 1 ? "vehicle" : "vehicles"} ticked
          </span>
          <Button type="button" onClick={() => setConfirming(true)}>
            Declare {chosen.length === 1 ? "this vehicle" : `these ${chosen.length}`}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setTicked(new Set())}>
            Clear the ticks
          </Button>
        </div>
      ) : null}

      {result ? (
        <Notice
          tone={result.skipped.length > 0 ? "caution" : "affirm"}
          title={`${result.declared} ${result.declared === 1 ? "vehicle" : "vehicles"} declared${result.skipped.length > 0 ? `, ${result.skipped.length} skipped` : ""}`}
          role="status"
          action={
            <Button type="button" variant="ghost" onClick={() => setResult(null)}>
              Close
            </Button>
          }
        >
          {result.skipped.length > 0 ? (
            <ul className="mt-1 list-disc pl-5">
              {result.skipped.map((entry) => (
                <li key={entry.id}>
                  <span className="font-mono">{entry.plate ?? "A vehicle"}</span>:{" "}
                  {skipWords(entry.reason)}
                </li>
              ))}
            </ul>
          ) : null}
        </Notice>
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
              {canTick ? <TableHeader>Tick</TableHeader> : null}
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
                {canTick ? (
                  <TableCell label="Tick">
                    {isTickable(vehicle) ? (
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-line accent-primary"
                        aria-label={`Tick ${vehicle.plateNumberDisplay}`}
                        checked={ticked.has(vehicle.id)}
                        onChange={() => toggle(vehicle.id)}
                      />
                    ) : null}
                  </TableCell>
                ) : null}
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

      {confirming ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setConfirming(false);
            }
          }}
          title={`Declare ${chosen.length} ${chosen.length === 1 ? "vehicle" : "vehicles"}?`}
          tone="primary"
          confirmLabel="Declare"
          description={
            <p>
              Each ticked vehicle is declared as it is: nothing more is asked
              of it. It then counts in the vehicle total given to outside
              organisations from today. A vehicle that cannot be declared is
              skipped, and you are told which and why. Each declaration is
              recorded in the audit trail.
            </p>
          }
          onConfirm={declareChosen}
        >
          {progress ? <p className="text-sm text-muted-foreground">{progress}</p> : null}
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
