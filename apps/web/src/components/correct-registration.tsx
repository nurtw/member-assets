"use client";

import type { ApplicationDetail, UpdateApplicationInput } from "@nurtw/contracts";
import { useState } from "react";

import { Field, TextInput } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError, api } from "@/lib/api";

/**
 * Correcting a saved registration (item 61, `QUESTIONS.md` MEM-20).
 *
 * Registering makes a member active at once, so there is no draft to edit.
 * An administrator corrects at any time (`PATCH /members/:id/registration`); the
 * officer who registered the member has **one** correction
 * (`PATCH /applications/:id`). The API decides who may, and the screen only
 * offers it where `ApplicationDetail.correction` says so.
 *
 * It sends only the sections that changed. The personal section is sent whole,
 * as the API takes it, with what the form never shows (the local government
 * area and the state of origin) carried over from the record so a correction
 * does not blank it. A NIN is never shown or sent here: it is changed on the
 * member's record.
 */
export function CorrectRegistration({
  application,
  onOpenChange,
  onSaved,
}: {
  application: ApplicationDetail;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<unknown>;
}) {
  const { member, contact, nextOfKin, guarantor } = application;
  const once = application.correction === "ONCE";

  const [personal, setPersonal] = useState({
    surname: member.surname,
    firstName: member.firstName,
    middleName: member.middleName ?? "",
    phone: contact?.phone ?? "",
    residentialAddress: contact?.residentialAddress ?? "",
    townCity: contact?.townCity ?? "",
  });
  const [kin, setKin] = useState({
    fullName: nextOfKin?.fullName ?? "",
    phone: nextOfKin?.phone ?? "",
    address: nextOfKin?.address ?? "",
  });
  const [bond, setBond] = useState({
    fullName: guarantor?.fullName ?? "",
    phone: guarantor?.phone ?? "",
    address: guarantor?.address ?? "",
  });

  const personalChanged =
    personal.surname !== member.surname ||
    personal.firstName !== member.firstName ||
    personal.middleName !== (member.middleName ?? "") ||
    personal.phone !== (contact?.phone ?? "") ||
    personal.residentialAddress !== (contact?.residentialAddress ?? "") ||
    personal.townCity !== (contact?.townCity ?? "");
  const kinChanged =
    kin.fullName !== (nextOfKin?.fullName ?? "") ||
    kin.phone !== (nextOfKin?.phone ?? "") ||
    kin.address !== (nextOfKin?.address ?? "");
  const bondChanged =
    bond.fullName !== (guarantor?.fullName ?? "") ||
    bond.phone !== (guarantor?.phone ?? "") ||
    bond.address !== (guarantor?.address ?? "");

  async function save() {
    // The section is sent whole, as the API takes it.
    const body: Record<string, unknown> = {};
    if (personalChanged) {
      body.applicant = {
        surname: personal.surname,
        firstName: personal.firstName,
        middleName: personal.middleName.trim() || undefined,
        residentialAddress: personal.residentialAddress,
        townCity: personal.townCity.trim() || undefined,
        residentialLgaId: contact?.lga?.id,
        stateOfOrigin: contact?.stateOfOrigin ?? undefined,
        phone: personal.phone,
      };
    }
    if (kinChanged) {
      body.nextOfKin = {
        fullName: kin.fullName,
        phone: kin.phone,
        address: kin.address.trim() || undefined,
      };
    }
    if (bondChanged) {
      body.guarantor = {
        fullName: bond.fullName,
        phone: bond.phone,
        address: bond.address,
      };
    }
    if (Object.keys(body).length === 0) {
      throw new ApiError(400, "Nothing was changed.");
    }
    const input = body as UpdateApplicationInput;
    await (application.correction === "ANYTIME"
      ? api.patch(`/members/${member.id}/registration`, input)
      : api.patch(`/applications/${application.id}`, input));
    await onSaved();
  }

  const text =
    <T extends Record<string, string>>(
      state: T,
      set: (next: T) => void,
      key: keyof T & string,
    ) =>
    ({
      value: state[key],
      onChange: (event: { target: { value: string } }) =>
        set({ ...state, [key]: event.target.value }),
    });

  return (
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Correct this registration"
      tone="primary"
      confirmLabel="Save the correction"
      description={
        <p>
          {once
            ? "You registered this member, so you have one correction. Check it before you save: after this, only an administrator can change it. "
            : "Every correction is recorded in the audit trail with the sections it changed. "}
          The NIN and the photograph are changed on the member’s record.
        </p>
      }
      onConfirm={save}
    >
      <div className="grid max-h-[55vh] gap-4 overflow-y-auto pr-1">
        <fieldset className="grid gap-3">
          <legend className="text-sm font-medium">Personal details</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Surname" htmlFor="cr-surname">
              <TextInput id="cr-surname" {...text(personal, setPersonal, "surname")} />
            </Field>
            <Field label="First name" htmlFor="cr-first">
              <TextInput id="cr-first" {...text(personal, setPersonal, "firstName")} />
            </Field>
            <Field label="Middle name" htmlFor="cr-middle">
              <TextInput id="cr-middle" {...text(personal, setPersonal, "middleName")} />
            </Field>
          </div>
          <Field label="Telephone" htmlFor="cr-phone">
            <TextInput
              id="cr-phone"
              inputMode="tel"
              autoComplete="off"
              {...text(personal, setPersonal, "phone")}
            />
          </Field>
          <Field label="Residential address" htmlFor="cr-address">
            <TextInput
              id="cr-address"
              {...text(personal, setPersonal, "residentialAddress")}
            />
          </Field>
          <Field label="Town / City" htmlFor="cr-town">
            <TextInput id="cr-town" {...text(personal, setPersonal, "townCity")} />
          </Field>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="text-sm font-medium">Next of kin</legend>
          <Field label="Full name" htmlFor="cr-kin-name">
            <TextInput id="cr-kin-name" {...text(kin, setKin, "fullName")} />
          </Field>
          <Field label="Telephone" htmlFor="cr-kin-phone">
            <TextInput
              id="cr-kin-phone"
              inputMode="tel"
              autoComplete="off"
              {...text(kin, setKin, "phone")}
            />
          </Field>
          <Field label="Address" htmlFor="cr-kin-address">
            <TextInput id="cr-kin-address" {...text(kin, setKin, "address")} />
          </Field>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="text-sm font-medium">
            Guarantor{guarantor ? "" : " (none recorded)"}
          </legend>
          <Field label="Full name" htmlFor="cr-g-name">
            <TextInput id="cr-g-name" {...text(bond, setBond, "fullName")} />
          </Field>
          <Field label="Telephone" htmlFor="cr-g-phone">
            <TextInput
              id="cr-g-phone"
              inputMode="tel"
              autoComplete="off"
              {...text(bond, setBond, "phone")}
            />
          </Field>
          <Field label="Address" htmlFor="cr-g-address">
            <TextInput id="cr-g-address" {...text(bond, setBond, "address")} />
          </Field>
        </fieldset>
      </div>
    </ConfirmDialog>
  );
}
