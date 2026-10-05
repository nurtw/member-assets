"use client";

import {
  API_SCOPES,
  API_SCOPE_DESCRIPTIONS,
  DISCLOSURE_FIELD_LABELS,
  type ApiScope,
  type DisclosureFieldCheck,
} from "@nurtw/contracts";
import { useState } from "react";

import { Button } from "@/components/ui";
import { ApiError } from "@/lib/api";

/**
 * Pieces shared by the API access screens (item 11): the one-time token
 * panel, and the scope and field pickers. The sidebar names each screen
 * (item 32), so they carry no tabs of their own.
 */

/** "3 Oct 2026", or a dash. */
export function shortDay(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Lagos",
  });
}

/** "3 Oct 2026, 14:05", or a dash. */
export function moment(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Lagos",
  });
}

/**
 * The API answers every conflict with the same generic message (Requirement
 * 14.3), so the screen says what a conflict means for the act just tried.
 */
export function explained(caught: unknown, conflict: string): ApiError {
  if (caught instanceof ApiError) {
    return caught.status === 409
      ? new ApiError(409, conflict, caught.requestId)
      : caught;
  }
  return new ApiError(0, "The service could not be reached.");
}

export function fieldLabel(field: string): string {
  return (
    DISCLOSURE_FIELD_LABELS[field as keyof typeof DISCLOSURE_FIELD_LABELS]
      ?.label ?? field
  );
}

export function scopeDescription(scope: string): string {
  return API_SCOPE_DESCRIPTIONS[scope as ApiScope] ?? scope;
}

/**
 * A token, shown the one time it exists outside the organisation's hands
 * (PRD Requirement 12.1).
 *
 * It lives in this component's state and nowhere else: not in the URL, not
 * in the SWR cache, not in browser storage. Leaving the page loses it, which
 * is the point.
 */
export function OneTimeToken({
  token,
  organisationName,
  onDone,
}: {
  token: string;
  organisationName: string;
  onDone: () => void;
}) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");

  return (
    <section
      aria-labelledby="one-time-token-title"
      className="rounded-lg border-2 border-verdict-caution bg-verdict-caution-surface p-5"
    >
      <h2 id="one-time-token-title" className="text-base font-semibold">
        Copy this token now — it will not be shown again
      </h2>
      <p className="mt-1 text-sm">
        The System keeps only a fingerprint of it, so nobody can display it
        again, including you. Pass it to the technical contact at{" "}
        {organisationName} by a secure route. If it is lost or exposed, replace
        or revoke it.
      </p>
      <p
        className="mt-3 select-all break-all rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm"
        aria-label="API token"
      >
        {token}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(token);
              setCopy("copied");
            } catch {
              setCopy("failed");
            }
          }}
        >
          Copy token
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          I have passed it on
        </Button>
        <span role="status" className="text-sm">
          {copy === "copied"
            ? "Copied."
            : copy === "failed"
              ? "Could not copy. Select the token and copy it by hand."
              : ""}
        </span>
      </div>
    </section>
  );
}

/** Checkboxes over the scope catalogue, each with what it allows. */
export function ScopePicker({
  idPrefix,
  value,
  onChange,
  disabled,
}: {
  idPrefix: string;
  value: readonly string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">
        Scopes
        <span className="ml-1 text-verdict-deny" aria-hidden>
          *
        </span>
      </legend>
      <p className="text-xs text-faint-foreground">
        What the organisation may ask. Grant only what its stated purpose needs.
      </p>
      {API_SCOPES.map((scope) => {
        const id = `${idPrefix}-${scope.replace(/:/g, "-")}`;
        const checked = value.includes(scope);
        return (
          <label
            key={scope}
            htmlFor={id}
            className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line px-3 py-2"
          >
            <input
              id={id}
              type="checkbox"
              className="mt-1"
              checked={checked}
              disabled={disabled}
              onChange={() =>
                onChange(
                  checked
                    ? value.filter((held) => held !== scope)
                    : [...value, scope],
                )
              }
            />
            <span>
              <span className="block text-sm">
                {API_SCOPE_DESCRIPTIONS[scope]}
              </span>
              <span className="block font-mono text-xs text-faint-foreground">
                {scope}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

const CHECK_HEADINGS: Record<DisclosureFieldCheck, string> = {
  VEHICLE: "On a vehicle or sticker check",
  MEMBERSHIP: "On a membership check",
  BOTH: "On either check",
};

/**
 * Checkboxes over the fields a profile may name: the external tier of the
 * verification catalogue, and nothing else. An internal-only field is not
 * offered, and the API refuses one regardless.
 */
export function FieldPicker({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: readonly string[];
  onChange: (next: string[]) => void;
}) {
  const fields = Object.entries(DISCLOSURE_FIELD_LABELS);
  return (
    <fieldset className="grid gap-3">
      <legend className="text-sm font-medium">Fields disclosed</legend>
      <p className="text-xs text-faint-foreground">
        A response carries the match result and only the fields ticked here.
        Tick none for a profile that confirms a match and says nothing more.
      </p>
      {(Object.keys(CHECK_HEADINGS) as DisclosureFieldCheck[]).map((check) => (
        <div key={check} className="grid gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint-foreground">
            {CHECK_HEADINGS[check]}
          </p>
          {fields
            .filter(([, entry]) => entry.check === check)
            .map(([field, entry]) => {
              const id = `${idPrefix}-${field}`;
              const checked = value.includes(field);
              return (
                <label
                  key={field}
                  htmlFor={id}
                  className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line px-3 py-2"
                >
                  <input
                    id={id}
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    onChange={() =>
                      onChange(
                        checked
                          ? value.filter((held) => held !== field)
                          : [...value, field],
                      )
                    }
                  />
                  <span>
                    <span className="block text-sm font-medium">
                      {entry.label}
                    </span>
                    <span className="block text-xs text-faint-foreground">
                      {entry.description}
                    </span>
                  </span>
                </label>
              );
            })}
        </div>
      ))}
    </fieldset>
  );
}

/** A profile's fields as a sentence an officer can read. */
export function ProfileFields({ fields }: { fields: readonly string[] }) {
  if (fields.length === 0) {
    return (
      <p className="text-sm italic text-faint-foreground">
        No record field. A response confirms a match and nothing more.
      </p>
    );
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {fields.map((field) => (
        <li
          key={field}
          className="rounded-full border border-line bg-surface-muted px-2.5 py-0.5 text-xs"
        >
          {fieldLabel(field)}
        </li>
      ))}
    </ul>
  );
}
