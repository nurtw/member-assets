"use client";

import type { MasterDataEntry, OrganisationTreeNode } from "@nurtw/contracts";
import { useState, type FormEvent, type ReactNode } from "react";
import useSWR from "swr";

import { MemberPicker } from "@/components/member-picker";
import {
  Button,
  ErrorNotice,
  Field,
  Section,
  Select,
  TextArea,
  TextInput,
} from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";

/**
 * The vehicle form, shared by the vehicles screen and the registration flow.
 *
 * Two modes, one form (PRD Requirements 9.5 and 9.7):
 *
 * - `declare` posts to `/vehicles` — a declaration, for `vehicle.declare`
 *   holders. A plate already on record is declared in place by the API.
 * - `record` posts to `/vehicles/record` — the vehicle goes ON RECORD only,
 *   for field enumerators. Nothing about it is a declaration.
 *
 * Route type and the owner's name and phone are required in both
 * (Requirements 9.8–9.9, revision 1.3). The owner need not be a member: the
 * driver is the member, chosen separately — or fixed, in the registration flow.
 */

export interface SavedVehicle {
  id: string;
  status: string;
  plateNumberDisplay: string;
}

/**
 * The API answers every conflict with the same generic message (Requirement
 * 14.3), so the form says in plain words what a 409 means here. Nothing below
 * discloses more than the status code already has: neither message says where
 * an existing record is.
 */
function explainConflict(error: ApiError, mode: "declare" | "record"): ApiError {
  if (error.status !== 409) {
    return error;
  }
  return new ApiError(
    409,
    mode === "record"
      ? "A record for this plate number already exists, so it was not recorded again. If this vehicle needs to be declared, ask an officer who can declare vehicles."
      : "This vehicle could not be declared as entered. The plate may already be on record in another area, or the branch or unit may be inactive. Ask an administrator to check.",
    error.requestId,
    error.details,
  );
}

/** Depth-first flatten of the visible hierarchy to active branches and units. */
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

export function VehicleForm({
  mode,
  fixedMember,
  defaultOrganisationId,
  onSaved,
  offerAddAnother = false,
  extraActions,
}: {
  mode: "declare" | "record";
  /** The registration flow's applicant — shown, not choosable (Requirement 9.10). */
  fixedMember?: { id: string; label: string };
  defaultOrganisationId?: string;
  /** `addAnother` is true when the officer chose "Save and add another". */
  onSaved: (vehicle: SavedVehicle, addAnother: boolean) => void;
  offerAddAnother?: boolean;
  extraActions?: ReactNode;
}) {
  const [plateNumberDisplay, setPlateNumberDisplay] = useState("");
  const [organisationId, setOrganisationId] = useState(
    defaultOrganisationId ?? "",
  );
  const [routeTypeId, setRouteTypeId] = useState("");
  const [vehicleCategoryId, setVehicleCategoryId] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [chassisVinRestricted, setChassisVinRestricted] = useState("");
  const [notes, setNotes] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerAddress, setOwnerAddress] = useState("");
  const [memberId, setMemberId] = useState<string | null>(null);
  const [memberLabel, setMemberLabel] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: tree, error: treeError } = useSWR<{
    organisations: OrganisationTreeNode[];
  }>("/organisations", fetcher);
  const { data: categoryList, error: categoryError } = useSWR<{
    entries: MasterDataEntry[];
  }>("/master-data/vehicle-categories", fetcher);
  const { data: routeTypeList, error: routeTypeError } = useSWR<{
    entries: MasterDataEntry[];
  }>("/master-data/route-types", fetcher);

  const organisations = collectDeclarable(tree?.organisations ?? []);
  const categories = categoryList?.entries ?? [];
  const routeTypes = routeTypeList?.entries ?? [];
  const loadError = [treeError, categoryError, routeTypeError].find(
    (candidate): candidate is ApiError => candidate instanceof ApiError,
  );
  const shown = error ?? loadError ?? null;

  function resetVehicleFields() {
    // Keep the branch/unit and route type: an officer adding a second vehicle
    // for the same member is usually in the same place, on the same route.
    setPlateNumberDisplay("");
    setVehicleCategoryId("");
    setMake("");
    setModel("");
    setColor("");
    setChassisVinRestricted("");
    setNotes("");
    setOwnerName("");
    setOwnerPhone("");
    setOwnerAddress("");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as
      | HTMLButtonElement
      | null;
    const addAnother = submitter?.value === "another";

    setSubmitting(true);
    setError(null);

    const declaredByMemberId = fixedMember?.id ?? memberId ?? undefined;

    try {
      const response = await api.post<{ vehicle: SavedVehicle }>(
        mode === "declare" ? "/vehicles" : "/vehicles/record",
        {
          plateNumberDisplay,
          organisationId,
          routeTypeId,
          vehicleCategoryId: vehicleCategoryId || undefined,
          make: make.trim() || undefined,
          model: model.trim() || undefined,
          color: color.trim() || undefined,
          chassisVinRestricted: chassisVinRestricted.trim() || undefined,
          declaredByMemberId,
          owner: {
            name: ownerName,
            phone: ownerPhone,
            address: ownerAddress.trim() || undefined,
          },
          notes: notes.trim() || undefined,
        },
      );
      setSubmitting(false);
      if (addAnother) {
        resetVehicleFields();
      }
      onSaved(response.vehicle, addAnother);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? explainConflict(caught, mode)
          : new ApiError(0, "The service could not be reached."),
      );
      setSubmitting(false);
    }
  }

  const verb = mode === "declare" ? "Declare" : "Save";

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {shown ? (
        <ErrorNotice message={shown.message} requestId={shown.requestId} />
      ) : null}

      <Section title="Vehicle">
        <Field label="Plate number" htmlFor="plateNumberDisplay" required>
          <TextInput
            id="plateNumberDisplay"
            required
            value={plateNumberDisplay}
            onChange={(event) => setPlateNumberDisplay(event.target.value)}
          />
        </Field>

        {/*
          VEH-33, the order the Union asked for: plate, chassis, the other
          vehicle details, the route, then the branch. The chassis number is
          not yet required here; that is VEH-34, in item 43.
        */}
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

        <Field label="Vehicle type" htmlFor="vehicleCategoryId">
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
            <TextInput
              id="make"
              value={make}
              onChange={(event) => setMake(event.target.value)}
            />
          </Field>
          <Field label="Model" htmlFor="model">
            <TextInput
              id="model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
            />
          </Field>
          <Field label="Colour" htmlFor="color">
            <TextInput
              id="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
            />
          </Field>
        </div>

        <Field label="Route type" htmlFor="routeTypeId" required>
          <Select
            id="routeTypeId"
            required
            value={routeTypeId}
            onChange={(event) => setRouteTypeId(event.target.value)}
          >
            <option value="">Select a route type</option>
            {routeTypes.map((routeType) => (
              <option key={routeType.id} value={routeType.id}>
                {routeType.label}
              </option>
            ))}
          </Select>
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
      </Section>

      <Section
        title="Owner"
        description="Whoever owns the vehicle. They need not be a member of the Union — the driver is the member. Kept private: never shown on a scan or to an outside organisation."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Owner's name" htmlFor="ownerName" required>
            <TextInput
              id="ownerName"
              required
              value={ownerName}
              onChange={(event) => setOwnerName(event.target.value)}
            />
          </Field>
          <Field label="Owner's phone" htmlFor="ownerPhone" required>
            <TextInput
              id="ownerPhone"
              required
              inputMode="tel"
              autoComplete="off"
              value={ownerPhone}
              onChange={(event) => setOwnerPhone(event.target.value)}
            />
          </Field>
        </div>
        <Field label="Owner's address" htmlFor="ownerAddress">
          <TextInput
            id="ownerAddress"
            value={ownerAddress}
            onChange={(event) => setOwnerAddress(event.target.value)}
          />
        </Field>
      </Section>

      <Section title="Driver">
        {fixedMember ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-faint-foreground">
              Member
            </p>
            <p className="mt-0.5 text-sm">{fixedMember.label}</p>
          </div>
        ) : (
          <MemberPicker
            label="Member"
            htmlFor="declaredByMemberId"
            hint="The member who drives this vehicle. May be left blank and added later."
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
        )}

        <Field
          label="Notes"
          htmlFor="notes"
          hint="Internal only. Never exposed through verification."
        >
          <TextArea
            id="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
      </Section>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" value="finish" disabled={submitting}>
          {submitting ? "Saving…" : `${verb} vehicle`}
        </Button>
        {offerAddAnother ? (
          <Button
            type="submit"
            value="another"
            variant="secondary"
            disabled={submitting}
          >
            {verb} and add another
          </Button>
        ) : null}
        {extraActions}
      </div>
    </form>
  );
}
