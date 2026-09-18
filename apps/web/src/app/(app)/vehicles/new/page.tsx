"use client";

import type { MasterDataEntry, OrganisationTreeNode } from "@nurtw/contracts";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import useSWR from "swr";

import { MemberPicker } from "@/components/member-picker";
import { Button, ErrorNotice, Field, Section, Select, TextArea, TextInput } from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";

/**
 * Declaring a vehicle (PRD §9.5).
 *
 * A manual, deliberate act — this screen is reachable only for an officer
 * holding `vehicle.declare`, which belongs to the super administrator alone
 * and to those it is expressly granted to. A plate already carrying an
 * ACTIVE declaration is not refused outright: the API records the new
 * declaration as DISPUTED and preserves both, which this screen surfaces as
 * a warning rather than an error.
 */

/** Depth-first flatten of the visible hierarchy to branches and units. */
function collectDeclarable(
  nodes: OrganisationTreeNode[],
): { id: string; name: string; level: string }[] {
  return nodes.flatMap((node) => [
    ...(node.level === "BRANCH" || node.level === "UNIT"
      ? node.isActive
        ? [{ id: node.id, name: node.name, level: node.level }]
        : []
      : []),
    ...collectDeclarable(node.children),
  ]);
}

export default function DeclareVehiclePage() {
  const router = useRouter();
  const [plateNumberDisplay, setPlateNumberDisplay] = useState("");
  const [organisationId, setOrganisationId] = useState("");
  const [vehicleCategoryId, setVehicleCategoryId] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [chassisVinRestricted, setChassisVinRestricted] = useState("");
  const [notes, setNotes] = useState("");
  const [memberId, setMemberId] = useState<string | null>(null);
  const [memberLabel, setMemberLabel] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [disputed, setDisputed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { data: tree, error: treeError } = useSWR<{
    organisations: OrganisationTreeNode[];
  }>("/organisations", fetcher);
  const { data: categoryList, error: categoryError } = useSWR<{
    entries: MasterDataEntry[];
  }>("/master-data/vehicle-categories", fetcher);

  const organisations = collectDeclarable(tree?.organisations ?? []);
  const categories = categoryList?.entries ?? [];
  const loadError = [treeError, categoryError].find(
    (candidate): candidate is ApiError => candidate instanceof ApiError,
  );
  const shown = error ?? loadError ?? null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setDisputed(false);

    try {
      const response = await api.post<{ vehicle: { id: string; status: string } }>(
        "/vehicles",
        {
          plateNumberDisplay,
          organisationId,
          vehicleCategoryId: vehicleCategoryId || undefined,
          make: make.trim() || undefined,
          model: model.trim() || undefined,
          color: color.trim() || undefined,
          chassisVinRestricted: chassisVinRestricted.trim() || undefined,
          declaredByMemberId: memberId ?? undefined,
          notes: notes.trim() || undefined,
        },
      );

      if (response.vehicle.status === "DISPUTED") {
        // Recorded, not rejected (PRD §23.9) — let the officer see the
        // declaration and its conflicting counterpart rather than silently
        // landing on the list as if nothing unusual happened.
        setDisputed(true);
        setSubmitting(false);
        setTimeout(() => router.push(`/vehicles/${response.vehicle.id}`), 2500);
        return;
      }

      router.push(`/vehicles/${response.vehicle.id}`);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "The service could not be reached."),
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="grid max-w-2xl gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Declare a vehicle
        </h1>
        <p className="mt-1 text-sm text-black/60">
          A declaration is not an ownership claim — it records that the Union
          has seen evidence to its own satisfaction, nothing more.
        </p>
      </div>

      {shown ? (
        <ErrorNotice message={shown.message} requestId={shown.requestId} />
      ) : null}

      {disputed ? (
        <div className="rounded-md border border-[var(--verdict-caution)]/30 bg-[var(--verdict-caution-surface)] px-4 py-3 text-sm">
          <p className="font-semibold text-[var(--verdict-caution)]">
            Recorded as disputed
          </p>
          <p className="mt-1">
            A declaration for this plate already exists and is active. Both
            declarations are preserved; taking you to this one now.
          </p>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="grid gap-4">
        <Section title="Declaration">
          <Field label="Plate number" htmlFor="plateNumberDisplay" required>
            <TextInput
              id="plateNumberDisplay"
              required
              value={plateNumberDisplay}
              onChange={(event) => setPlateNumberDisplay(event.target.value)}
            />
          </Field>

          <Field label="Branch or unit" htmlFor="organisationId" required>
            <Select
              id="organisationId"
              required
              value={organisationId}
              onChange={(event) => setOrganisationId(event.target.value)}
            >
              <option value="">Select a branch or unit</option>
              {organisations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.level === "UNIT" ? "Unit" : "Branch"})
                </option>
              ))}
            </Select>
          </Field>

          <MemberPicker
            label="Operator (member)"
            htmlFor="declaredByMemberId"
            hint="A vehicle may be declared against a branch or unit alone — this may be left blank and attached to a member later."
            selectedId={memberId}
            selectedLabel={memberLabel}
            onSelect={(member) => {
              setMemberId(member.id);
              setMemberLabel(member.label);
            }}
            onClear={() => {
              setMemberId(null);
              setMemberLabel(null);
            }}
          />

          <Field label="Vehicle category" htmlFor="vehicleCategoryId">
            <Select
              id="vehicleCategoryId"
              value={vehicleCategoryId}
              onChange={(event) => setVehicleCategoryId(event.target.value)}
            >
              <option value="">Not stated</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Make" htmlFor="make">
              <TextInput id="make" value={make} onChange={(event) => setMake(event.target.value)} />
            </Field>
            <Field label="Model" htmlFor="model">
              <TextInput id="model" value={model} onChange={(event) => setModel(event.target.value)} />
            </Field>
            <Field label="Colour" htmlFor="color">
              <TextInput id="color" value={color} onChange={(event) => setColor(event.target.value)} />
            </Field>
          </div>

          <Field
            label="Chassis / VIN"
            htmlFor="chassisVinRestricted"
            hint="Restricted — visible only to officers holding vehicle.read_restricted, and never through verification."
          >
            <TextInput
              id="chassisVinRestricted"
              value={chassisVinRestricted}
              onChange={(event) => setChassisVinRestricted(event.target.value)}
            />
          </Field>

          <Field label="Notes" htmlFor="notes" hint="Internal only. Never exposed through verification.">
            <TextArea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
        </Section>

        <div>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Declaring…" : "Declare vehicle"}
          </Button>
        </div>
      </form>
    </div>
  );
}
