"use client";

import type {
  LgaEntry,
  MasterDataEntry,
  OrganisationTreeNode,
} from "@nurtw/contracts";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import useSWR from "swr";

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
import { NIGERIAN_STATES } from "@/lib/nigerian-states";

/**
 * The Union's Membership / Registration / Guarantorship form.
 *
 * One page, four sections, matching the paper original — because the officer is
 * transcribing a completed paper form in one sitting. A wizard would make them
 * navigate between steps to check a field they can already see, and would create
 * four ways to record half a registration.
 *
 * Field labels reproduce the printed form's wording. Where the printed wording is
 * not yet confirmed (`QUESTIONS.md` MEM-08, MEM-09, MEM-10) the field is present
 * and marked, rather than guessed at or quietly omitted.
 */

interface FormState {
  [key: string]: string | boolean;
}

const INITIAL: FormState = {
  surname: "",
  firstName: "",
  middleName: "",
  residentialAddress: "",
  area: "",
  townCity: "",
  residentialLgaId: "",
  stateOfOrigin: "",
  phone: "",
  organisationId: "",
  designationId: "",
  nokSurname: "",
  nokFirstName: "",
  nokMiddleName: "",
  nokAddress: "",
  nokTownCity: "",
  nokLgaId: "",
  nokStateOfOrigin: "",
  nokPhone: "",
  nokOccupation: "",
  gSurname: "",
  gFirstName: "",
  gMiddleName: "",
  gAddress: "",
  gTownCity: "",
  gRelationship: "",
  gPhone: "",
  gOccupation: "",
  gHasCollateral: false,
  gCollateralDetails: "",
};

/** Depth-first flatten of the visible hierarchy down to units. */
function collectUnits(
  nodes: OrganisationTreeNode[],
): { id: string; name: string }[] {
  return nodes.flatMap((node) => [
    ...(node.level === "UNIT" && node.isActive
      ? [{ id: node.id, name: node.name }]
      : []),
    ...collectUnits(node.children),
  ]);
}

export default function NewApplicationPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [error, setError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * The reference data the form offers.
   *
   * Through SWR rather than a hand-written effect, as on every other screen.
   * The effect this replaced held an `AbortController` whose cleanup fired on
   * Strict Mode's second invocation, cancelling the very requests it had just
   * issued — and the client reported that cancellation as "the service could
   * not be reached". SWR owns request lifetime, deduplicates across screens,
   * and keeps the fetch out of an effect body, which is what the React compiler
   * asks for.
   */
  const { data: tree, error: treeError } = useSWR<{
    organisations: OrganisationTreeNode[];
  }>("/organisations", fetcher);
  const { data: lgaList, error: lgaError } = useSWR<{ lgas: LgaEntry[] }>(
    "/master-data/lgas",
    fetcher,
  );
  const { data: designationList, error: designationError } = useSWR<{
    entries: MasterDataEntry[];
  }>("/master-data/designations", fetcher);

  const units = collectUnits(tree?.organisations ?? []);
  const lgas = lgaList?.lgas ?? [];
  const designations = designationList?.entries ?? [];

  // A submission failure takes precedence: it is the one the officer just
  // caused and the one they can act on.
  const loadError = [treeError, lgaError, designationError].find(
    (candidate): candidate is ApiError => candidate instanceof ApiError,
  );
  const shown = error ?? loadError ?? null;

  const set = (key: string) => (value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));

  /**
   * "Same as applicant's address" for the next-of-kin section. A one-time
   * copy, not a live link: the officer can still edit the next-of-kin fields
   * afterward (a next of kin sharing a household today may not always), and
   * re-ticking the box copies again from whatever the applicant fields hold
   * at that moment.
   */
  function copyApplicantAddressToNextOfKin() {
    setForm((current) => ({
      ...current,
      nokAddress: current.residentialAddress,
      nokTownCity: current.townCity,
      nokLgaId: current.residentialLgaId,
      nokStateOfOrigin: current.stateOfOrigin,
    }));
  }

  const text = (key: string) => ({
    value: form[key] as string,
    onChange: (event: { target: { value: string } }) =>
      set(key)(event.target.value),
  });

  /** Drops empty strings so optional fields are absent rather than blank. */
  const optional = (key: string) => {
    const value = (form[key] as string).trim();
    return value.length > 0 ? value : undefined;
  };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await api.post<{ application: { id: string } }>(
        "/applications",
        {
          applicant: {
            surname: form.surname,
            firstName: form.firstName,
            middleName: optional("middleName"),
            residentialAddress: form.residentialAddress,
            area: optional("area"),
            townCity: optional("townCity"),
            residentialLgaId: optional("residentialLgaId"),
            stateOfOrigin: optional("stateOfOrigin"),
            phone: form.phone,
          },
          assignment: {
            organisationId: form.organisationId,
            designationId: optional("designationId"),
          },
          nextOfKin: {
            surname: form.nokSurname,
            firstName: form.nokFirstName,
            middleName: optional("nokMiddleName"),
            address: form.nokAddress,
            townCity: optional("nokTownCity"),
            lgaId: optional("nokLgaId"),
            stateOfOrigin: optional("nokStateOfOrigin"),
            phone: form.nokPhone,
            occupation: optional("nokOccupation"),
          },
          // MEM-06: a guarantor is not compulsory. Omit the section entirely
          // unless the officer has actually started filling it in.
          guarantor: optional("gSurname")
            ? {
                surname: form.gSurname,
                firstName: form.gFirstName,
                middleName: optional("gMiddleName"),
                address: form.gAddress,
                townCity: optional("gTownCity"),
                relationshipToApplicant: form.gRelationship,
                phone: form.gPhone,
                occupation: optional("gOccupation"),
                hasCollateral: form.gHasCollateral as boolean,
                collateralDetails: optional("gCollateralDetails"),
              }
            : undefined,
        },
      );
      router.push(`/applications/${response.application.id}`);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "The service could not be reached."),
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSubmitting(false);
    }
  }

  /** Server-side field failures, shown against the field that failed. */
  const fieldError = (path: string) => error?.fieldError(path);

  return (
    <form onSubmit={onSubmit} className="grid max-w-3xl gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Membership registration
        </h1>
        <p className="mt-1 text-sm text-black/60">
          Transcribe the completed Membership / Registration / Guarantorship
          form. The application is saved as a draft and may be amended until it
          is submitted for review.
        </p>
      </div>

      {shown ? (
        <ErrorNotice
          message={
            shown.details.length > 0
              ? "Some entries need attention. They are marked below."
              : shown.message
          }
          requestId={shown.requestId}
        />
      ) : null}

      <Section title="Section A — Personal">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Surname" htmlFor="surname" required error={fieldError("applicant.surname")}>
            <TextInput id="surname" required {...text("surname")} />
          </Field>
          <Field label="First name" htmlFor="firstName" required error={fieldError("applicant.firstName")}>
            <TextInput id="firstName" required {...text("firstName")} />
          </Field>
          <Field label="Middle name" htmlFor="middleName">
            <TextInput id="middleName" {...text("middleName")} />
          </Field>
        </div>

        <Field
          label="Residential address"
          htmlFor="residentialAddress"
          required
          error={fieldError("applicant.residentialAddress")}
        >
          <TextArea id="residentialAddress" required {...text("residentialAddress")} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Area" htmlFor="area">
            <TextInput id="area" {...text("area")} />
          </Field>
          <Field label="Town / City" htmlFor="townCity">
            <TextInput id="townCity" {...text("townCity")} />
          </Field>
          <Field label="Local Government Area" htmlFor="residentialLgaId">
            <Select id="residentialLgaId" {...text("residentialLgaId")}>
              <option value="">Not stated</option>
              {lgas.map((lga) => (
                <option key={lga.id} value={lga.id}>
                  {lga.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="State of origin"
            htmlFor="stateOfOrigin"
            hint="Where the applicant is from. Not the same as where they live."
          >
            <Select id="stateOfOrigin" {...text("stateOfOrigin")}>
              <option value="">Not stated</option>
              {NIGERIAN_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label="Tel. No. of Operator"
          htmlFor="phone"
          required
          hint="Nigerian number, in any format."
          error={fieldError("applicant.phone")}
        >
          <TextInput id="phone" type="tel" required placeholder="0803 123 4567" {...text("phone")} />
        </Field>
      </Section>

      <Section
        title="Section B — Unity Body"
        description="The unit the applicant belongs to. The unit's own address is held against the unit record."
      >
        <Field
          label="Name of Unity"
          htmlFor="organisationId"
          required
          error={fieldError("assignment.organisationId")}
        >
          <Select id="organisationId" required {...text("organisationId")}>
            <option value="">Select a unit</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Designation"
          htmlFor="designationId"
          hint={
            designations.length === 0
              ? "The Union has not yet supplied its designation list, so this may be left blank and added later."
              : undefined
          }
        >
          <Select id="designationId" {...text("designationId")}>
            <option value="">Not stated</option>
            {designations.map((designation) => (
              <option key={designation.id} value={designation.id}>
                {designation.label}
              </option>
            ))}
          </Select>
        </Field>
      </Section>

      <Section title="Section C — Next of Kin">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Surname" htmlFor="nokSurname" required error={fieldError("nextOfKin.surname")}>
            <TextInput id="nokSurname" required {...text("nokSurname")} />
          </Field>
          <Field label="First name" htmlFor="nokFirstName" required error={fieldError("nextOfKin.firstName")}>
            <TextInput id="nokFirstName" required {...text("nokFirstName")} />
          </Field>
          <Field label="Middle name" htmlFor="nokMiddleName">
            <TextInput id="nokMiddleName" {...text("nokMiddleName")} />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-black/70">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-[var(--border-subtle)] accent-[var(--nurtw-green)]"
            onChange={(event) => {
              if (event.target.checked) {
                copyApplicantAddressToNextOfKin();
              }
            }}
          />
          Same as applicant&apos;s address
        </label>

        <Field label="Address" htmlFor="nokAddress" required error={fieldError("nextOfKin.address")}>
          <TextArea id="nokAddress" required {...text("nokAddress")} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Town / City" htmlFor="nokTownCity">
            <TextInput id="nokTownCity" {...text("nokTownCity")} />
          </Field>
          <Field label="Local Government Area" htmlFor="nokLgaId">
            <Select id="nokLgaId" {...text("nokLgaId")}>
              <option value="">Not stated</option>
              {lgas.map((lga) => (
                <option key={lga.id} value={lga.id}>
                  {lga.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="State of origin" htmlFor="nokStateOfOrigin">
            <Select id="nokStateOfOrigin" {...text("nokStateOfOrigin")}>
              <option value="">Not stated</option>
              {NIGERIAN_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Tel. No. of Next of Kin"
            htmlFor="nokPhone"
            required
            error={fieldError("nextOfKin.phone")}
          >
            <TextInput id="nokPhone" type="tel" required {...text("nokPhone")} />
          </Field>
        </div>

        <Field label="Occupation of next of kin" htmlFor="nokOccupation">
          <TextInput id="nokOccupation" {...text("nokOccupation")} />
        </Field>
      </Section>

      <Section title="Section D — Guarantor">
        <p className="text-xs text-black/50">
          Optional. Leave every field blank if this application has no guarantor.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Surname" htmlFor="gSurname" error={fieldError("guarantor.surname")}>
            <TextInput id="gSurname" {...text("gSurname")} />
          </Field>
          <Field label="First name" htmlFor="gFirstName" error={fieldError("guarantor.firstName")}>
            <TextInput id="gFirstName" {...text("gFirstName")} />
          </Field>
          <Field label="Middle name" htmlFor="gMiddleName">
            <TextInput id="gMiddleName" {...text("gMiddleName")} />
          </Field>
        </div>

        <Field label="Address" htmlFor="gAddress" error={fieldError("guarantor.address")}>
          <TextArea id="gAddress" {...text("gAddress")} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Town / City" htmlFor="gTownCity">
            <TextInput id="gTownCity" {...text("gTownCity")} />
          </Field>
          <Field
            label="Relationship with Operator / Applicant"
            htmlFor="gRelationship"
            error={fieldError("guarantor.relationshipToApplicant")}
          >
            <TextInput id="gRelationship" {...text("gRelationship")} />
          </Field>
          <Field
            label="Tel. No. of Guarantor"
            htmlFor="gPhone"
            error={fieldError("guarantor.phone")}
          >
            <TextInput id="gPhone" type="tel" {...text("gPhone")} />
          </Field>
          <Field label="Occupation of Guarantor" htmlFor="gOccupation">
            <TextInput id="gOccupation" {...text("gOccupation")} />
          </Field>
        </div>

        {/*
          The collateral undertaking. The printed wording is not fully legible on
          the photographed form and the vehicle class it names is unconfirmed
          (QUESTIONS.md MEM-08), so the question is shown as recorded in the field
          specification and marked, rather than paraphrased into something the
          Union never wrote.
        */}
        <fieldset className="rounded-md border border-[var(--border-subtle)] p-4">
          <legend className="px-1 text-sm font-medium">
            Do you have any collateral to secure the tricycle/motorcycle for one
            year?
          </legend>
          <p className="mb-3 text-xs text-black/50">
            Wording awaiting confirmation against the printed form.
          </p>
          <div className="flex gap-6">
            {[
              { label: "Yes", value: true },
              { label: "No", value: false },
            ].map((option) => (
              <label key={option.label} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="gHasCollateral"
                  checked={form.gHasCollateral === option.value}
                  onChange={() => set("gHasCollateral")(option.value)}
                  className="h-4 w-4 accent-[var(--nurtw-green)]"
                />
                {option.label}
              </label>
            ))}
          </div>

          {form.gHasCollateral === true ? (
            <div className="mt-4">
              <Field
                label="Collateral details"
                htmlFor="gCollateralDetails"
                required
                error={fieldError("guarantor.collateralDetails")}
              >
                <TextArea id="gCollateralDetails" {...text("gCollateralDetails")} />
              </Field>
            </div>
          ) : null}
        </fieldset>
      </Section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save as draft"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push("/applications")}
        >
          Cancel
        </Button>
      </div>

      <p className="text-xs leading-relaxed text-black/50">
        Next of kin and guarantor details are held separately from card data and
        are never disclosed through a verification enquiry.
      </p>
    </form>
  );
}
