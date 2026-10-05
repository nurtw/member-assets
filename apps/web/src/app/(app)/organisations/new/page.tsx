"use client";

import type { ApiClientDetail } from "@nurtw/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  Button,
  ErrorNotice,
  Field,
  PageHeader,
  Section,
  TextArea,
  TextInput,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { useSession } from "@/lib/session";

/**
 * Registering an organisation directly (PRD §12.1, item 11), for one the
 * Union already knows: an officer enters it, and it is pending until approved.
 * An organisation that should fill in its own details is invited instead
 * (item 33), or applies through the portal.
 */

/** One address or range per line; blank lines ignored. */
function ranges(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function RegisterForm() {
  const router = useRouter();
  const [organisationName, setOrganisationName] = useState("");
  const [businessPurpose, setBusinessPurpose] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [addresses, setAddresses] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const fieldError = (path: string) => error?.fieldError(path);
  const rangeError = error?.details.find((detail) =>
    detail.field.startsWith("allowedIpRanges"),
  )?.message;

  return (
    <Section
      title="Register an organisation"
      description="Records who the organisation is and why it wants access. It can do nothing until it is approved."
    >
      {error && error.details.length === 0 ? (
        <ErrorNotice message={error.message} requestId={error.requestId} />
      ) : null}
      <Field
        label="Organisation"
        htmlFor="organisationName"
        required
        hint="Its legal or operational name."
        error={fieldError("organisationName")}
      >
        <TextInput
          id="organisationName"
          value={organisationName}
          onChange={(event) => setOrganisationName(event.target.value)}
          maxLength={200}
        />
      </Field>
      <Field
        label="Purpose"
        htmlFor="businessPurpose"
        required
        hint="What it will use the access for."
        error={fieldError("businessPurpose")}
      >
        <TextArea
          id="businessPurpose"
          value={businessPurpose}
          onChange={(event) => setBusinessPurpose(event.target.value)}
          maxLength={2000}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Technical contact"
          htmlFor="contactName"
          required
          error={fieldError("technicalContact.name")}
        >
          <TextInput
            id="contactName"
            value={contactName}
            onChange={(event) => setContactName(event.target.value)}
          />
        </Field>
        <Field
          label="Contact email"
          htmlFor="contactEmail"
          required
          hint="Where a token reminder goes."
          error={fieldError("technicalContact.email")}
        >
          <TextInput
            id="contactEmail"
            type="email"
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
          />
        </Field>
        <Field
          label="Contact phone"
          htmlFor="contactPhone"
          error={fieldError("technicalContact.phone")}
        >
          <TextInput
            id="contactPhone"
            inputMode="tel"
            value={contactPhone}
            onChange={(event) => setContactPhone(event.target.value)}
          />
        </Field>
      </div>
      <Field
        label="Allowed addresses"
        htmlFor="allowedIpRanges"
        hint="One address or range per line, such as 203.0.113.0/24. Leave blank to allow any address."
        error={rangeError}
      >
        <TextArea
          id="allowedIpRanges"
          value={addresses}
          onChange={(event) => setAddresses(event.target.value)}
          className="font-mono"
        />
      </Field>
      <div>
        <Button
          type="button"
          disabled={
            busy ||
            organisationName.trim().length < 2 ||
            businessPurpose.trim().length < 10 ||
            contactName.trim().length < 2 ||
            !contactEmail.includes("@")
          }
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const response = await api.post<{ client: ApiClientDetail }>(
                "/api-clients",
                {
                  organisationName,
                  businessPurpose,
                  technicalContact: {
                    name: contactName,
                    email: contactEmail.trim(),
                    ...(contactPhone.trim() ? { phone: contactPhone } : {}),
                  },
                  allowedIpRanges: ranges(addresses),
                },
              );
              router.push(`/organisations/${response.client.id}`);
            } catch (caught) {
              setError(
                caught instanceof ApiError
                  ? caught
                  : new ApiError(0, "The service could not be reached."),
              );
              setBusy(false);
            }
          }}
        >
          Register
        </Button>
      </div>
    </Section>
  );
}

export default function RegisterOrganisationPage() {
  const { holds } = useSession();

  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <Link
          href="/organisations"
          className="text-sm text-faint-foreground underline-offset-2 hover:underline"
        >
          ← Organisations
        </Link>
      </div>
      <PageHeader
        title="Register an organisation"
        description="For an organisation the Union already knows. To let an organisation fill in its own details, invite it from the Organisations page instead."
      />
      {holds("api_client.manage") ? (
        <RegisterForm />
      ) : (
        <ErrorNotice message="Your account cannot register organisations. Ask an administrator for the API administration permission." />
      )}
    </div>
  );
}
