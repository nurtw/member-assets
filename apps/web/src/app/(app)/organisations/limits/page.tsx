"use client";

import type {
  RateLimitProfileSummary,
  RateLimitProfileValues,
} from "@nurtw/contracts";
import { useState } from "react";
import useSWR from "swr";

import { explained, moment } from "@/components/api-access";
import {
  Button,
  ErrorNotice,
  Field,
  Section,
  TextInput,
} from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { useSession } from "@/lib/session";

/**
 * Limit profiles (PRD §14, §23.12 — item 13).
 *
 * A profile holds every number an outside organisation is held to: how fast
 * it may ask, how much in an hour and a day, and when abuse detection pauses
 * it. Any officer who reads organisations sees these; only a holder of
 * `rate_limit.manage` changes them, and a change applies to the next request
 * of every organisation holding the profile (Requirement 14.1).
 */

type Key = keyof RateLimitProfileValues;

interface NumberField {
  key: Key;
  label: string;
  hint: string;
  /** May be left blank, meaning none. */
  optional?: boolean;
}

const QUOTA_FIELDS: NumberField[] = [
  {
    key: "verificationPerMinute",
    label: "Checks a minute",
    hint: "The steady rate for plate, sticker, and membership checks.",
  },
  {
    key: "aggregatePerMinute",
    label: "Totals a minute",
    hint: "The steady rate for vehicle totals.",
  },
  {
    key: "burst",
    label: "Burst",
    hint: "How many requests may arrive at once before the rate applies.",
  },
  {
    key: "hourlyQuota",
    label: "Hourly quota",
    hint: "Requests in a clock hour. Leave blank for none.",
    optional: true,
  },
  {
    key: "dailyQuota",
    label: "Daily quota",
    hint: "Requests in a day, counted from midnight in Lagos.",
  },
];

const DETECTION_FIELDS: NumberField[] = [
  {
    key: "windowMinutes",
    label: "Window (minutes)",
    hint: "The period checks are counted over.",
  },
  {
    key: "forgeryThreshold",
    label: "Forged codes",
    hint: "Forged sticker codes in one window that pause the organisation.",
  },
  {
    key: "missThreshold",
    label: "Non-matches",
    hint: "Non-matching checks in one window that pause it, if they are also…",
  },
  {
    key: "missPercent",
    label: "Non-match share (%)",
    hint: "…at least this share of its checks in that window.",
  },
  {
    key: "sequenceThreshold",
    label: "Sequence length",
    hint: "Plates or sticker numbers in sequence, matching nothing, that pause it.",
  },
  {
    key: "sequenceReach",
    label: "Sequence step",
    hint: "How far apart two numbers may be and still count as the next step.",
  },
  {
    key: "pauseMinutes",
    label: "Pause (minutes)",
    hint: "How long a pause lasts. An officer can lift it sooner.",
  },
];

const ALL_FIELDS = [...QUOTA_FIELDS, ...DETECTION_FIELDS];

type Draft = Record<Key, string>;

function draftOf(values: RateLimitProfileValues | null): Draft {
  return Object.fromEntries(
    ALL_FIELDS.map(({ key }) => [
      key,
      values === null || values[key] === null ? "" : String(values[key]),
    ]),
  ) as Draft;
}

/** The draft as the API takes it: whole numbers, and `null` for blank. */
function numbersOf(draft: Draft): Record<Key, number | null> {
  return Object.fromEntries(
    ALL_FIELDS.map(({ key, optional }) => {
      const text = draft[key].trim();
      return [key, text === "" && optional ? null : Number(text)];
    }),
  ) as Record<Key, number | null>;
}

function NumberFields({
  idPrefix,
  fields,
  draft,
  onChange,
  error,
}: {
  idPrefix: string;
  fields: NumberField[];
  draft: Draft;
  onChange: (next: Draft) => void;
  error: ApiError | null;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => (
        <Field
          key={field.key}
          label={field.label}
          htmlFor={`${idPrefix}-${field.key}`}
          required={!field.optional}
          hint={field.hint}
          error={error?.fieldError(field.key)}
        >
          <TextInput
            id={`${idPrefix}-${field.key}`}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={draft[field.key]}
            onChange={(event) =>
              onChange({ ...draft, [field.key]: event.target.value })
            }
          />
        </Field>
      ))}
    </div>
  );
}

function ProfileValues({ profile }: { profile: RateLimitProfileSummary }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[
        ["Quotas", QUOTA_FIELDS],
        ["Abuse detection", DETECTION_FIELDS],
      ].map(([heading, fields]) => (
        <div key={heading as string} className="grid gap-1.5 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint-foreground">
            {heading as string}
          </p>
          {/* The heading sits outside the list: a list of terms holds only terms. */}
          <dl className="grid gap-1.5">
            {(fields as NumberField[]).map((field) => (
              <div key={field.key} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{field.label}</dt>
                <dd className="font-medium tabular-nums">
                  {profile[field.key] === null
                    ? "None"
                    : profile[field.key]!.toLocaleString("en-GB")}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

function AmendForm({
  profile,
  onDone,
}: {
  profile: RateLimitProfileSummary;
  onDone: () => Promise<unknown>;
}) {
  const [label, setLabel] = useState(profile.label);
  const [description, setDescription] = useState(profile.description ?? "");
  const [draft, setDraft] = useState(draftOf(profile));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  return (
    <div className="grid gap-4 border-t border-line pt-4">
      {error && error.details.length === 0 ? (
        <ErrorNotice message={error.message} requestId={error.requestId} />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor={`label-${profile.code}`} required>
          <TextInput
            id={`label-${profile.code}`}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={120}
          />
        </Field>
        <Field label="Description" htmlFor={`description-${profile.code}`}>
          <TextInput
            id={`description-${profile.code}`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={500}
          />
        </Field>
      </div>
      <NumberFields
        idPrefix={`amend-${profile.code}`}
        fields={ALL_FIELDS}
        draft={draft}
        onChange={setDraft}
        error={error}
      />
      {profile.clientCount > 0 ? (
        <p className="rounded-md border border-verdict-caution/40 bg-verdict-caution-surface px-3 py-2 text-sm">
          {profile.clientCount === 1
            ? "One organisation holds this profile."
            : `${profile.clientCount} organisations hold this profile.`}{" "}
          A change applies to their next request.
        </p>
      ) : null}
      <Field label="Reason" htmlFor={`reason-${profile.code}`} required>
        <TextInput
          id={`reason-${profile.code}`}
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
              await api.put(`/rate-limits/profiles/${profile.code}`, {
                label,
                ...(description.trim() ? { description } : {}),
                ...numbersOf(draft),
                reason: reason.trim(),
              });
              await onDone();
            } catch (caught) {
              setError(explained(caught, "This profile could not be changed."));
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

function ComposeForm({ onCreated }: { onCreated: () => Promise<unknown> }) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [draft, setDraft] = useState(draftOf(null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  return (
    <Section
      title="Compose a profile"
      description="For a kind of organisation the existing profiles do not fit. Every number is required except the hourly quota."
    >
      {error && error.details.length === 0 ? (
        <ErrorNotice message={error.message} requestId={error.requestId} />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Name"
          htmlFor="limitLabel"
          required
          error={error?.fieldError("label")}
        >
          <TextInput
            id="limitLabel"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={120}
          />
        </Field>
        <Field
          label="Code"
          htmlFor="limitCode"
          required
          hint="Capital letters, digits, and underscores, such as INSURER_BATCH. Fixed once created."
          error={error?.fieldError("code")}
        >
          <TextInput
            id="limitCode"
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
      <NumberFields
        idPrefix="compose"
        fields={ALL_FIELDS}
        draft={draft}
        onChange={setDraft}
        error={error}
      />
      <div>
        <Button
          type="button"
          disabled={busy || label.trim().length < 2 || code.length < 3}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api.post("/rate-limits/profiles", {
                code,
                label,
                ...numbersOf(draft),
              });
              setCode("");
              setLabel("");
              setDraft(draftOf(null));
              await onCreated();
            } catch (caught) {
              setError(
                explained(caught, "A limit profile with that code exists."),
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

export default function LimitProfilesPage() {
  const { holds } = useSession();
  const canManage = holds("rate_limit.manage");
  const [amending, setAmending] = useState<string | null>(null);

  const { data, error, isLoading, mutate } = useSWR<{
    profiles: RateLimitProfileSummary[];
  }>("/rate-limits/profiles", fetcher);
  const profiles = data?.profiles ?? [];
  const loadError = error instanceof ApiError ? error : null;

  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Limits</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A limit profile sets how much an outside organisation may ask, and
          when the System pauses one whose checks follow a pattern. An
          organisation over a limit is told to wait and try again; a paused one
          is refused until the pause ends or an officer lifts it.
        </p>
      </div>

      {loadError ? (
        <ErrorNotice
          message={loadError.message}
          requestId={loadError.requestId}
        />
      ) : null}
      {isLoading ? (
        <p className="text-sm text-faint-foreground">Loading…</p>
      ) : null}

      {profiles.map((profile) => (
        <Section
          key={profile.code}
          title={profile.label}
          description={profile.description ?? undefined}
        >
          <div className="flex flex-wrap items-center gap-2 text-xs text-faint-foreground">
            <span className="font-mono">{profile.code}</span>
            <span>
              {profile.clientCount === 0
                ? "Held by no organisation"
                : profile.clientCount === 1
                  ? "Held by 1 organisation"
                  : `Held by ${profile.clientCount} organisations`}
            </span>
            <span>Last changed {moment(profile.updatedAt)}</span>
          </div>
          <ProfileValues profile={profile} />
          {canManage ? (
            amending === profile.code ? (
              <AmendForm
                key={`${profile.code}:${profile.updatedAt}`}
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
                  onClick={() => setAmending(profile.code)}
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
