"use client";

import type { MasterDataEntry, VehicleDetail } from "@nurtw/contracts";
import { useState } from "react";
import useSWR from "swr";

import { Field, Select, TextArea, TextInput } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError, api, fetcher } from "@/lib/api";

/**
 * Correcting an imported vehicle's details (item 62, `QUESTIONS.md` VEH-40).
 *
 * An administrator corrects at any time. A field enumerator or a vehicle-record
 * officer has one edit, shared by the vehicle: after the first save it is locked
 * to them. The API decides (`VehicleDetail.edit`); the screen only offers it
 * where it says so, and sends by the route that right names.
 *
 * It sends only what changed. A blank owner part, chassis number, make, model, or
 * colour is never sent, so a correction cannot blank what is recorded. The plate,
 * the branch or unit, and the driver are not here: one edit may not change them.
 */
export function CorrectVehicle({
  vehicle,
  onOpenChange,
  onSaved,
}: {
  vehicle: VehicleDetail;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<unknown>;
}) {
  const once = vehicle.edit.right === "ONCE";

  const { data: categoryList } = useSWR<{ entries: MasterDataEntry[] }>(
    "/master-data/vehicle-categories",
    fetcher,
  );
  const { data: routeTypeList } = useSWR<{ entries: MasterDataEntry[] }>(
    "/master-data/route-types",
    fetcher,
  );

  const [categoryId, setCategoryId] = useState(vehicle.vehicleCategory?.id ?? "");
  const [routeTypeId, setRouteTypeId] = useState(vehicle.routeType?.id ?? "");
  const [make, setMake] = useState(vehicle.make ?? "");
  const [model, setModel] = useState(vehicle.model ?? "");
  const [color, setColor] = useState(vehicle.color ?? "");
  // The chassis number is shown only to an officer who may read it. Left blank,
  // it is not sent, so the one recorded stays.
  const [chassis, setChassis] = useState("");
  const [ownerName, setOwnerName] = useState(vehicle.owner?.name ?? "");
  const [ownerPhone, setOwnerPhone] = useState(vehicle.owner?.phone ?? "");
  const [ownerAddress, setOwnerAddress] = useState(vehicle.owner?.address ?? "");
  const [notes, setNotes] = useState(vehicle.notes ?? "");

  async function save() {
    const body: Record<string, unknown> = {};
    if (categoryId !== (vehicle.vehicleCategory?.id ?? "") && categoryId) {
      body.vehicleCategoryId = categoryId;
    }
    if (routeTypeId !== (vehicle.routeType?.id ?? "") && routeTypeId) {
      body.routeTypeId = routeTypeId;
    }
    if (make.trim() && make !== (vehicle.make ?? "")) body.make = make.trim();
    if (model.trim() && model !== (vehicle.model ?? "")) body.model = model.trim();
    if (color.trim() && color !== (vehicle.color ?? "")) body.color = color.trim();
    if (chassis.trim()) body.chassisVinRestricted = chassis.trim();
    if (notes.trim() && notes !== (vehicle.notes ?? "")) body.notes = notes.trim();
    const owner = {
      name: ownerName.trim() !== (vehicle.owner?.name ?? "") ? ownerName.trim() : "",
      phone: ownerPhone.trim() !== (vehicle.owner?.phone ?? "") ? ownerPhone.trim() : "",
      address:
        ownerAddress.trim() !== (vehicle.owner?.address ?? "")
          ? ownerAddress.trim()
          : "",
    };
    if (owner.name || owner.phone || owner.address) {
      body.owner = {
        name: owner.name || undefined,
        phone: owner.phone || undefined,
        address: owner.address || undefined,
      };
    }
    if (Object.keys(body).length === 0) {
      // Nothing was changed, so the one edit is not spent.
      throw new ApiError(400, "Nothing was changed.");
    }
    try {
      await api.patch(
        vehicle.edit.via === "UPDATE"
          ? `/vehicles/${vehicle.id}`
          : `/vehicles/${vehicle.id}/imported`,
        body,
      );
    } catch (caught) {
      // The API's 409 is generic (Requirement 14.3).
      if (caught instanceof ApiError && caught.status === 409) {
        await onSaved();
        throw new ApiError(
          409,
          "This vehicle's one edit has already been used, so it was not saved. An administrator can still change it.",
          caught.requestId,
        );
      }
      throw caught;
    }
    await onSaved();
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Correct this vehicle"
      tone="primary"
      confirmLabel="Save the correction"
      description={
        <p>
          {once
            ? "You have one edit of this vehicle. Check it before you save: after this, only an administrator can change it. "
            : "Every correction is recorded in the audit trail with the fields it changed. "}
          The plate number, the branch or unit, and the driver are not changed
          here. A blank is never saved over what is recorded.
        </p>
      }
      onConfirm={save}
    >
      <div className="grid max-h-[55vh] gap-4 overflow-y-auto pr-1">
        <Field
          label="Chassis / VIN"
          htmlFor="cv-chassis"
          hint={
            vehicle.chassisRecorded
              ? "One is recorded. Type here only to replace it."
              : "None is recorded."
          }
        >
          <TextInput
            id="cv-chassis"
            value={chassis}
            onChange={(event) => setChassis(event.target.value)}
            autoCapitalize="characters"
            spellCheck={false}
          />
        </Field>
        <Field label="Vehicle type" htmlFor="cv-category">
          <Select
            id="cv-category"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">Not stated</option>
            {(categoryList?.entries ?? []).map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Make" htmlFor="cv-make">
            <TextInput
              id="cv-make"
              value={make}
              onChange={(event) => setMake(event.target.value)}
            />
          </Field>
          <Field label="Model" htmlFor="cv-model">
            <TextInput
              id="cv-model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
            />
          </Field>
          <Field label="Colour" htmlFor="cv-colour">
            <TextInput
              id="cv-colour"
              value={color}
              onChange={(event) => setColor(event.target.value)}
            />
          </Field>
        </div>
        <Field
          label="Route type"
          htmlFor="cv-route"
          hint="Until one is set, the default levy applies."
        >
          <Select
            id="cv-route"
            value={routeTypeId}
            onChange={(event) => setRouteTypeId(event.target.value)}
          >
            <option value="">Not stated</option>
            {(routeTypeList?.entries ?? []).map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset className="grid gap-3">
          <legend className="text-sm font-medium">Owner</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Owner's name" htmlFor="cv-owner-name">
              <TextInput
                id="cv-owner-name"
                value={ownerName}
                onChange={(event) => setOwnerName(event.target.value)}
              />
            </Field>
            <Field label="Owner's phone" htmlFor="cv-owner-phone">
              <TextInput
                id="cv-owner-phone"
                inputMode="tel"
                autoComplete="off"
                value={ownerPhone}
                onChange={(event) => setOwnerPhone(event.target.value)}
              />
            </Field>
          </div>
          <Field label="Owner's address" htmlFor="cv-owner-address">
            <TextInput
              id="cv-owner-address"
              value={ownerAddress}
              onChange={(event) => setOwnerAddress(event.target.value)}
            />
          </Field>
        </fieldset>
        <Field
          label="Notes"
          htmlFor="cv-notes"
          hint="Internal only. Never exposed through verification."
        >
          <TextArea
            id="cv-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
      </div>
    </ConfirmDialog>
  );
}
