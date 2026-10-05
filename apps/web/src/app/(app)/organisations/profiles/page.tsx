"use client";

import type { DisclosureProfileSummary } from "@nurtw/contracts";
import { useState } from "react";
import useSWR from "swr";

import { FieldPicker, ProfileFields, explained } from "@/components/api-access";
import {
  Button,
  ErrorNotice,
  Field,
  Loading,
  PageHeader,
  Section,
  TextInput,
} from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { useSession } from "@/lib/session";

/**
 * Disclosure profiles (PRD §15, item 11).
 *
 * A profile names what an outside organisation's verification response may
 * carry beyond the match itself. Profiles are data, so the Union composes a
 * new one without a release (Requirement 15.1). The four seeded from PRD §15
 * cannot be changed here, so that each goes on meaning what the PRD says.
 */

function ComposeForm({ onCreated }: { onCreated: () => Promise<unknown> }) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  return (
    <Section
      title="Compose a profile"
      description="For a kind of organisation the four standard profiles do not fit. Only fields an outside organisation may ever be told are offered."
    >
      {error && error.details.length === 0 ? (
        <ErrorNotice message={error.message} requestId={error.requestId} />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Name"
          htmlFor="profileLabel"
          required
          error={error?.fieldError("label")}
        >
          <TextInput
            id="profileLabel"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={120}
          />
        </Field>
        <Field
          label="Code"
          htmlFor="profileCode"
          required
          hint="Capital letters, digits, and underscores, such as INSURER_STANDARD. Fixed once created."
          error={error?.fieldError("code")}
        >
          <TextInput
            id="profileCode"
            value={code}
            onChange={(event) =>
              setCode(
                event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
              )
            }
            maxLength={50}
            className="font-mono"
          />
        </Field>
      </div>
      <Field label="Description" htmlFor="profileDescription">
        <TextInput
          id="profileDescription"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={500}
        />
      </Field>
      <FieldPicker idPrefix="compose" value={fields} onChange={setFields} />
      <div>
        <Button
          type="button"
          disabled={busy || label.trim().length < 2 || code.length < 3}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api.post("/disclosure-profiles", {
                code,
                label,
                ...(description.trim() ? { description } : {}),
                fields,
              });
              setCode("");
              setLabel("");
              setDescription("");
              setFields([]);
              await onCreated();
            } catch (caught) {
              setError(
                explained(caught, "A profile with that code already exists."),
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Create profile
        </Button>
      </div>
    </Section>
  );
}

function AmendForm({
  profile,
  onDone,
}: {
  profile: DisclosureProfileSummary;
  onDone: () => Promise<unknown>;
}) {
  const [label, setLabel] = useState(profile.label);
  const [description, setDescription] = useState(profile.description ?? "");
  const [fields, setFields] = useState<string[]>(profile.fields);
  const [isActive, setIsActive] = useState(profile.isActive);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const changedFields =
    [...fields].sort().join() !== [...profile.fields].sort().join();

  return (
    <div className="grid gap-4 border-t border-line pt-4">
      {error ? (
        <ErrorNotice message={error.message} requestId={error.requestId} />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor={`label-${profile.id}`} required>
          <TextInput
            id={`label-${profile.id}`}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={120}
          />
        </Field>
        <Field label="Description" htmlFor={`description-${profile.id}`}>
          <TextInput
            id={`description-${profile.id}`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={500}
          />
        </Field>
      </div>
      <FieldPicker
        idPrefix={`amend-${profile.id}`}
        value={fields}
        onChange={setFields}
      />
      {changedFields && profile.clientCount > 0 ? (
        <p className="rounded-md border border-verdict-caution/40 bg-verdict-caution-surface px-3 py-2 text-sm">
          {profile.clientCount === 1
            ? "One organisation holds this profile."
            : `${profile.clientCount} organisations hold this profile.`}{" "}
          The change applies to their next request.
        </p>
      ) : null}
      <label
        className="flex items-center gap-2 text-sm"
        htmlFor={`active-${profile.id}`}
      >
        <input
          id={`active-${profile.id}`}
          type="checkbox"
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
        />
        Offered when an organisation is approved or its access changed
      </label>
      <Field label="Reason" htmlFor={`reason-${profile.id}`} required>
        <TextInput
          id={`reason-${profile.id}`}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={1000}
        />
      </Field>
      <div>
        <Button
          type="button"
          disabled={busy || reason.trim().length < 4 || label.trim().length < 2}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api.patch(`/disclosure-profiles/${profile.id}`, {
                ...(label !== profile.label ? { label } : {}),
                ...(description !== (profile.description ?? "")
                  ? { description }
                  : {}),
                ...(changedFields ? { fields } : {}),
                ...(isActive !== profile.isActive ? { isActive } : {}),
                reason: reason.trim(),
              });
              await onDone();
            } catch (caught) {
              setError(
                explained(
                  caught,
                  isActive
                    ? "This profile cannot be changed."
                    : "Organisations still hold this profile. Move them to another profile before withdrawing it.",
                ),
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Save changes
        </Button>
      </div>
    </div>
  );
}

export default function DisclosureProfilesPage() {
  const { holds } = useSession();
  const canManage = holds("disclosure_profile.manage");
  const [amending, setAmending] = useState<string | null>(null);

  const { data, error, isLoading, mutate } = useSWR<{
    profiles: DisclosureProfileSummary[];
  }>("/disclosure-profiles", fetcher);

  const profiles = data?.profiles ?? [];
  const loadError = error instanceof ApiError ? error : null;

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader
        title="Disclosure profiles"
        description="A disclosure profile sets what an outside organisation is told about a record beyond the fact that it matched. Personal details, contact details, and anything about declaration or dues can never be disclosed, whatever a profile says."
      />

      {loadError ? (
        <ErrorNotice
          message={loadError.message}
          requestId={loadError.requestId}
        />
      ) : null}
      {isLoading ? <Loading /> : null}

      {profiles.map((profile) => (
        <Section
          key={profile.id}
          title={profile.label}
          description={profile.description ?? undefined}
        >
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono text-faint-foreground">
              {profile.code}
            </span>
            {profile.isSystem ? (
              <span className="rounded-full border border-line px-2 py-0.5">
                Standard (PRD §15) — cannot be changed
              </span>
            ) : null}
            {!profile.isActive ? (
              <span className="rounded-full border border-line bg-surface-muted px-2 py-0.5">
                Withdrawn — not offered
              </span>
            ) : null}
            <span className="text-faint-foreground">
              {profile.clientCount === 0
                ? "Held by no organisation"
                : profile.clientCount === 1
                  ? "Held by 1 organisation"
                  : `Held by ${profile.clientCount} organisations`}
            </span>
          </div>
          <ProfileFields fields={profile.fields} />
          {canManage && !profile.isSystem ? (
            amending === profile.id ? (
              <AmendForm
                key={`${profile.id}:${profile.fields.join()}:${profile.isActive}`}
                profile={profile}
                onDone={async () => {
                  await mutate();
                  setAmending(null);
                }}
              />
            ) : (
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setAmending(profile.id)}
                >
                  Change this profile
                </Button>
              </div>
            )
          ) : null}
        </Section>
      ))}

      {canManage ? <ComposeForm onCreated={() => mutate()} /> : null}
    </div>
  );
}
