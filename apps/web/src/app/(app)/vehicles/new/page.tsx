"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Notice, PageHeader } from "@/components/ui";
import { VehicleForm } from "@/components/vehicle-form";
import { useSession } from "@/lib/session";

/**
 * Adding a vehicle — by declaring it, or by recording it on record.
 *
 * A holder of `vehicle.declare` (the super administrator alone, and those it
 * is expressly granted to) declares, PRD §9.5. Anyone else holding
 * `vehicle.record` — a field enumerator — records the vehicle ON RECORD, which
 * is not a declaration (Requirement 9.7). The API decides regardless; this
 * only chooses which request the form sends.
 *
 * A plate already carrying an ACTIVE declaration is not refused outright: the
 * API records the new declaration as DISPUTED and preserves both, which this
 * screen surfaces as a warning rather than an error.
 */
export default function NewVehiclePage() {
  const router = useRouter();
  const { holds } = useSession();
  const [disputed, setDisputed] = useState(false);

  const mode = holds("vehicle.declare") ? "declare" : "record";

  return (
    <div className="grid max-w-2xl gap-6">
      <PageHeader
        title={mode === "declare" ? "Declare a vehicle" : "Record a vehicle"}
        back={{ href: "/vehicles", label: "Vehicles" }}
        description={
          mode === "declare"
            ? "A declaration is not an ownership claim — it records that the Union has seen evidence to its own satisfaction, nothing more. A vehicle already on record is declared in place."
            : "The vehicle goes on record. It is not declared, and counts for nothing outside the Union until an authorised officer declares it and a sticker is attached."
        }
      />

      {disputed ? (
        <Notice tone="caution" title="Recorded as disputed" role="status">
          A declaration for this plate already exists and is active. Both
          declarations are preserved; taking you to this one now.
        </Notice>
      ) : null}

      <VehicleForm
        mode={mode}
        onSaved={(vehicle) => {
          if (vehicle.status === "DISPUTED") {
            // Recorded, not rejected (PRD §23.9) — let the officer see the
            // declaration and its conflicting counterpart rather than
            // silently landing on it as if nothing unusual happened.
            setDisputed(true);
            setTimeout(
              () => router.push(`/vehicles/${vehicle.id}?added=1`),
              2500,
            );
            return;
          }
          // Item 35: the vehicle's page opens on a prompt to assign its
          // sticker.
          router.push(`/vehicles/${vehicle.id}?added=1`);
        }}
      />
    </div>
  );
}
