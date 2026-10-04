"use client";

import type { ApiClientDetail, ApiClientList } from "@nurtw/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";

import { ApiAccessTabs, moment, shortDay } from "@/components/api-access";
import {
  Button,
  ErrorNotice,
  Field,
  Section,
  StatusChip,
  TextArea,
  TextInput,
} from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { useSession } from "@/lib/session";

/**
 * Outside organisations and their API access (PRD §12.1, item 11).
 *
 * Registering an organisation gives it nothing: it is pending until an
 * officer approves it with a disclosure profile, scopes, and a data-sharing
 * agreement, and it holds no token until one is issued on its own page.
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
              router.push(`/settings/api-access/${response.client.id}`);
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

export default function ApiAccessPage() {
  const router = useRouter();
  const { holds } = useSession();
  const canRead = holds("api_client.read");

  // An officer who may read profiles but not organisations is sent to the
  // profiles, rather than shown a refusal.
  useEffect(() => {
    if (!canRead && holds("disclosure_profile.read")) {
      router.replace("/settings/api-access/profiles");
    }
  }, [canRead, holds, router]);

  const { data, error, isLoading } = useSWR<ApiClientList>(
    canRead ? "/api-clients" : null,
    fetcher,
  );

  const clients = data?.clients ?? [];
  const loadError = error instanceof ApiError ? error : null;
  const expiring = clients.filter(
    (client) => client.currentToken?.expiringSoon,
  );
  const paused = clients.filter((client) => client.pausedUntil !== null);

  return (
    <div className="grid max-w-5xl gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">API access</h1>
        <p className="mt-1 text-sm text-black/60">
          Outside organisations approved to check the Union’s records through
          the API, what each may ask, and the token it holds. Every change needs
          a reason and is recorded in the audit trail.
        </p>
      </div>

      <ApiAccessTabs />

      {loadError ? (
        <ErrorNotice
          message={loadError.message}
          requestId={loadError.requestId}
        />
      ) : null}

      {paused.length > 0 ? (
        <div className="rounded-md border border-[var(--verdict-deny)]/30 bg-[var(--verdict-deny-surface)] px-4 py-3 text-sm">
          <p className="font-semibold text-[var(--verdict-deny)]">
            Paused by abuse detection
          </p>
          <p className="mt-1">
            The System is refusing these organisations’ requests for a time,
            because their checks followed a pattern. Open one to see why, and to
            lift the pause or suspend it.
          </p>
          <ul className="mt-2 list-disc pl-5">
            {paused.map((client) => (
              <li key={client.id}>
                <Link
                  href={`/settings/api-access/${client.id}`}
                  className="font-medium underline underline-offset-2"
                >
                  {client.organisationName}
                </Link>{" "}
                — until {moment(client.pausedUntil)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {expiring.length > 0 ? (
        <div className="rounded-md border border-[var(--verdict-caution)]/40 bg-[var(--verdict-caution-surface)] px-4 py-3 text-sm">
          <p className="font-semibold text-[var(--verdict-caution)]">
            Tokens to replace soon
          </p>
          <p className="mt-1">
            These expire within {data?.reminderDays} days. Replace each one and
            pass the new token to the organisation’s technical contact before
            the old one stops working.
          </p>
          <ul className="mt-2 list-disc pl-5">
            {expiring.map((client) => (
              <li key={client.id}>
                <Link
                  href={`/settings/api-access/${client.id}`}
                  className="font-medium underline underline-offset-2"
                >
                  {client.organisationName}
                </Link>{" "}
                — expires {shortDay(client.currentToken?.expiresAt ?? null)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-black/50">Loading…</p>
      ) : canRead && clients.length === 0 && !loadError ? (
        <div className="rounded-lg border border-dashed border-[var(--border-subtle)] p-10 text-center">
          <p className="text-sm font-medium">No organisations yet</p>
          <p className="mt-1 text-sm text-black/55">
            An organisation registered here appears in this list, pending
            approval.
          </p>
        </div>
      ) : clients.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-white">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)] text-left">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Organisation</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Profile</th>
                <th className="px-4 py-2.5 font-semibold">Scopes</th>
                <th className="px-4 py-2.5 font-semibold">Token</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr
                  key={client.id}
                  className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--surface-muted)]/60"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/settings/api-access/${client.id}`}
                      className="font-medium text-[var(--nurtw-navy)] underline-offset-2 hover:underline"
                    >
                      {client.organisationName}
                    </Link>
                    <span className="block text-xs text-black/45">
                      Registered {shortDay(client.createdAt)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip status={client.status} />
                    {client.pausedUntil ? (
                      <span className="mt-1 block text-xs font-semibold text-[var(--verdict-deny)]">
                        Paused until {moment(client.pausedUntil)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-black/70">
                    {client.disclosureProfile?.label ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-black/70">
                    {client.scopes.length === 0 ? "—" : client.scopes.length}
                  </td>
                  <td className="px-4 py-3">
                    {client.currentToken ? (
                      <>
                        <span className="font-mono text-xs">
                          {client.currentToken.prefix}…
                        </span>
                        <span className="block text-xs text-black/55">
                          {client.currentToken.expiringSoon
                            ? "Replace soon · "
                            : ""}
                          expires {shortDay(client.currentToken.expiresAt)}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs italic text-black/45">
                        None in use
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {holds("api_client.manage") ? <RegisterForm /> : null}
    </div>
  );
}
