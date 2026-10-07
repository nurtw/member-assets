"use client";

import type {
  LgaEntry,
  MasterDataEntry,
  OrganisationTreeNode,
} from "@nurtw/contracts";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import useSWR from "swr";

import {
  PhotographField,
  type Photograph,
} from "@/components/photograph-field";
import {
  Button,
  ErrorNotice,
  Field,
  PageHeader,
  Section,
  Select,
  TextArea,
  TextInput,
} from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { NIGERIAN_STATES } from "@/lib/nigerian-states";
import { useSession } from "@/lib/session";

/**
 * The Union's Membership / Registration / Guarantorship form.
 *
 * One page, four sections, matching the paper original — because the officer is
 * transcribing a completed paper form in one sitting. A wizard would make them
 * navigate between steps to check a field they can already see, and would create
 * four ways to record half a registration.
 *
 * Field labels reproduce the printed form's wording.
 *
 * **It no longer asks everything the paper form does** (PRD revision 1.14, from
 * the Union's Head of Operations on 6 October 2026): the member's name, address,
 * and telephone come first (`QUESTIONS.md` MEM-15); Area is not asked for
 * (MEM-17); a next of kin is a full name and a telephone number, with an
 * address if there is one (MEM-16); and a guarantor, where there is one, is a
 * full name, a telephone number, and an address (MEM-06). Do not put a field
 * back to match the paper form.
 */

interface FormState {
  [key: string]: string | boolean;
}

const INITIAL: FormState = {
  surname: "",
  firstName: "",
  middleName: "",
  residentialAddress: "",
  townCity: "",
  residentialLgaId: "",
  stateOfOrigin: "",
  phone: "",
  organisationId: "",
  designationId: "",
  nokFullName: "",
  nokPhone: "",
  nokAddress: "",
  gFullName: "",
  gPhone: "",
  gAddress: "",
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
  const { holds } = useSession();
  const [form, setForm] = useState<FormState>(INITIAL);
  // Uploaded as soon as it is taken, attached once the application exists.
  const [photograph, setPhotograph] = useState<Photograph | null>(null);
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
   * copy, not a live link: the officer can still edit the address afterward (a
   * next of kin sharing a household today may not always), and re-ticking the
   * box copies again from whatever the applicant's address holds at that
   * moment.
   */
  function copyApplicantAddressToNextOfKin() {
    setForm((current) => ({
      ...current,
      nokAddress: current.residentialAddress,
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

  const startedGuarantor = ["gFullName", "gPhone", "gAddress"].some(
    (key) => (form[key] as string).trim().length > 0,
  );

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
            fullName: form.nokFullName,
            phone: form.nokPhone,
            address: optional("nokAddress"),
          },
          // MEM-06: a guarantor is not compulsory. The section is left out
          // unless the officer has started filling it in; once any of its
          // three fields is filled, the API asks for all three.
          guarantor: startedGuarantor
            ? {
                fullName: form.gFullName,
                phone: form.gPhone,
                address: form.gAddress,
              }
            : undefined,
        },
      );
      // The photograph is attached to the application just made (MEM-18). If
      // that fails the application is still saved, so the officer is told and
      // sent on: it can be added from the application's page.
      if (photograph) {
        try {
          await api.patch(`/applications/${response.application.id}/media`, {
            passportPhotoId: photograph.id,
          });
        } catch {
          toast.error(
            "The application was saved, but the photograph was not attached. Add it on the application’s page.",
          );
        }
      }
      // PRD Requirement 9.10 (revision 1.3) — registration flows straight on
      // to the applicant's vehicle, which may be skipped. Only for an officer
      // who can add one; anyone else lands on the application as before.
      router.push(
        holds("vehicle.record") || holds("vehicle.declare")
          ? `/applications/${response.application.id}/vehicles`
          : `/applications/${response.application.id}`,
      );
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
      <PageHeader
        title="Membership registration"
        back={{ href: "/applications", label: "Applications" }}
        meta="Registration · Step 1 of 2"
        description="Transcribe the completed Membership / Registration / Guarantorship form, section by section as it is printed. The application is saved as a draft and may be amended until it is submitted for review. The member's vehicles are added in the next step."
      />

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

        {/* MEM-15: name, address, telephone, before anything else. */}
        <Field
          label="Tel. No. of Operator"
          htmlFor="phone"
          required
          hint="Nigerian number, in any format."
          error={fieldError("applicant.phone")}
        >
          <TextInput id="phone" type="tel" required placeholder="0803 123 4567" {...text("phone")} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
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
      </Section>

      <Section
        title="Photograph"
        description="The member’s photograph, taken now or chosen from this device."
      >
        <PhotographField value={photograph} onChange={setPhotograph} />
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

      <Section
        title="Section C — Next of Kin"
        description="A full name and a telephone number. An address may be added."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Full name of next of kin"
            htmlFor="nokFullName"
            required
            error={fieldError("nextOfKin.fullName")}
          >
            <TextInput id="nokFullName" required {...text("nokFullName")} />
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

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-line accent-primary"
            onChange={(event) => {
              if (event.target.checked) {
                copyApplicantAddressToNextOfKin();
              }
            }}
          />
          Same as applicant&apos;s address
        </label>

        <Field
          label="Address of next of kin"
          htmlFor="nokAddress"
          hint="Optional."
          error={fieldError("nextOfKin.address")}
        >
          <TextArea id="nokAddress" {...text("nokAddress")} />
        </Field>
      </Section>

      <Section
        title="Section D — Guarantor"
        description="Optional. Leave all three blank if this application has no guarantor. Where there is one, all three are needed."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Full name of guarantor"
            htmlFor="gFullName"
            required={startedGuarantor}
            error={fieldError("guarantor.fullName")}
          >
            <TextInput id="gFullName" {...text("gFullName")} />
          </Field>
          <Field
            label="Tel. No. of Guarantor"
            htmlFor="gPhone"
            required={startedGuarantor}
            error={fieldError("guarantor.phone")}
          >
            <TextInput id="gPhone" type="tel" {...text("gPhone")} />
          </Field>
        </div>

        <Field
          label="Address of guarantor"
          htmlFor="gAddress"
          required={startedGuarantor}
          error={fieldError("guarantor.address")}
        >
          <TextArea id="gAddress" {...text("gAddress")} />
        </Field>
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

      <p className="text-xs leading-relaxed text-faint-foreground">
        Next of kin and guarantor details are held separately from card data and
        are never disclosed through a verification enquiry.
      </p>
    </form>
  );
}
