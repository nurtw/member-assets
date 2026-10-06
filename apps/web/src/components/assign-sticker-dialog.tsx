"use client";

import type { VehicleSummary } from "@nurtw/contracts";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";

import { ErrorNotice, TextInput } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError, fetcher } from "@/lib/api";

/**
 * Straight to assigning a sticker (item 34's home screen): find the vehicle
 * by its plate, and open it at the panel where the fee is paid and the
 * sticker scanned.
 *
 * It reads the same list the Vehicles screen reads, limited by the API to the
 * officer's own area of responsibility. No vehicle is shown here that the
 * officer could not open there.
 */

const SHOWN = 6;

export function AssignStickerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [plate, setPlate] = useState("");
  const [wanted, setWanted] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setWanted(plate.trim()), 300);
    return () => clearTimeout(timer);
  }, [plate]);

  const { data, error, isLoading } = useSWR<{ vehicles: VehicleSummary[] }>(
    open && wanted.length >= 2
      ? `/vehicles?q=${encodeURIComponent(wanted)}`
      : null,
    fetcher,
    { keepPreviousData: true },
  );
  const vehicles = wanted.length >= 2 ? (data?.vehicles ?? []) : [];
  const failure = error instanceof ApiError ? error : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setPlate("");
          setWanted("");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign a sticker</DialogTitle>
          <DialogDescription>
            Which vehicle? Enter its plate number. On its page the sticker fee
            is paid, and then the sticker is scanned.
          </DialogDescription>
        </DialogHeader>
        <div>
          <label htmlFor="assignPlate" className="sr-only">
            Plate number
          </label>
          <TextInput
            id="assignPlate"
            type="search"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="e.g. AWK 123 XY"
            value={plate}
            onChange={(event) => setPlate(event.target.value)}
            autoFocus
            className="font-mono uppercase"
          />
        </div>
        {failure ? (
          <ErrorNotice
            message={failure.message}
            requestId={failure.requestId}
          />
        ) : null}
        <div className="min-h-24" role="status">
          {wanted.length < 2 ? (
            <p className="text-sm text-faint-foreground">
              Type at least two characters of the plate.
            </p>
          ) : isLoading && vehicles.length === 0 ? (
            <p className="text-sm text-faint-foreground">Looking…</p>
          ) : vehicles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No vehicle in your area of responsibility has that plate. Add the
              vehicle first, then assign its sticker.
            </p>
          ) : (
            <ul className="grid gap-1.5">
              {vehicles.slice(0, SHOWN).map((vehicle) => (
                <li key={vehicle.id}>
                  <Link
                    href={`/vehicles/${vehicle.id}?assign=1`}
                    onClick={() => onOpenChange(false)}
                    className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-sm transition-colors hover:border-line-strong hover:bg-surface-muted"
                  >
                    <span className="min-w-0">
                      <span className="block font-mono font-semibold">
                        {vehicle.plateNumberDisplay}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[
                          vehicle.vehicleCategory?.label,
                          vehicle.organisation.name,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <ArrowRight
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
              {vehicles.length > SHOWN ? (
                <li className="text-xs text-faint-foreground">
                  More match. Type more of the plate.
                </li>
              ) : null}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
