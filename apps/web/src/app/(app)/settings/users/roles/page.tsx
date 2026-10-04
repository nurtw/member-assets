"use client";

import { PERMISSIONS, type RoleSummary } from "@nurtw/contracts";
import { isGrantOnly, needsSecondFactor } from "@nurtw/domain";
import { useState } from "react";
import useSWR from "swr";

import { explained } from "@/components/api-access";
import { OfficerTabs } from "@/components/officers";
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
 * Roles (PRD §16, Decision 9.5 — item 28).
 *
 * The roles of PRD §16 cannot be changed, so each goes on meaning what the
 * Union believes it means. The Union composes further roles from the same
 * permissions. Two permissions never go in a role: they reach an officer only
 * by an express grant to a named person.
 */

const REFUSED =
  "The System refused this. A role can only be composed from permissions you hold yourself.";

/** Permissions a composed role may hold: all but the express-grant ones. */
const COMPOSABLE = PERMISSIONS.filter((entry) => !isGrantOnly(entry.code));

function describe(code: string): string {
  return PERMISSIONS.find((entry) => entry.code === code)?.description ?? code;
}

function PermissionPicker({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: readonly string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">
        Permissions
        <span className="ml-1 text-[var(--verdict-deny)]" aria-hidden>
          *
        </span>
      </legend>
      <p className="text-xs text-black/55">
        What a holder of the role may do. Give only what the work needs.
        Declaring a vehicle and changing the settlement account are not offered:
        each is granted to a named officer, never through a role.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {COMPOSABLE.map((entry) => {
          const id = `${idPrefix}-${entry.code.replace(/\W/g, "-")}`;
          const checked = value.includes(entry.code);
          return (
            <label
              key={entry.code}
              htmlFor={id}
              className="flex cursor-pointer items-start gap-2.5 rounded-md border border-[var(--border-subtle)] px-3 py-2"
            >
              <input
                id={id}
                type="checkbox"
                className="mt-1"
                checked={checked}
                onChange={() =>
                  onChange(
                    checked
                      ? value.filter((held) => held !== entry.code)
                      : [...value, entry.code],
                  )
                }
              />
              <span>
                <span className="block text-sm">{entry.description}</span>
                <span className="block font-mono text-xs text-black/50">
                  {entry.code}
                  {needsSecondFactor(entry.code)
                    ? " · needs a second factor"
                    : ""}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function RoleForm({
  role,
  onDone,
}: {
  /** The role being changed, or `null` to compose a new one. */
  role: RoleSummary | null;
  onDone: () => Promise<unknown>;
}) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState(role?.label ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [permissions, setPermissions] = useState<string[]>(
    role?.permissions ?? [],
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const prefix = role?.code ?? "new";

  return (
    <div className="grid gap-4">
      {error && error.details.length === 0 ? (
        <ErrorNotice message={error.message} requestId={error.requestId} />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Name"
          htmlFor={`${prefix}-label`}
          required
          error={error?.fieldError("label")}
        >
          <TextInput
            id={`${prefix}-label`}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={120}
          />
        </Field>
        {role ? null : (
          <Field
            label="Code"
            htmlFor="new-code"
            required
            hint="Capital letters, digits, and underscores, such as ZONE_CLERK. Fixed once created."
            error={error?.fieldError("code")}
          >
            <TextInput
              id="new-code"
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
        )}
      </div>
      <Field label="Description" htmlFor={`${prefix}-description`}>
        <TextInput
          id={`${prefix}-description`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={500}
        />
      </Field>
      <PermissionPicker
        idPrefix={prefix}
        value={permissions}
        onChange={setPermissions}
      />
      {role && role.assignmentCount > 0 ? (
        <p className="rounded-md border border-[var(--verdict-caution)]/40 bg-[var(--verdict-caution-surface)] px-3 py-2 text-sm">
          {role.assignmentCount === 1
            ? "One assignment names this role."
            : `${role.assignmentCount} assignments name this role.`}{" "}
          A change applies to each holder’s next request.
        </p>
      ) : null}
      {role ? (
        <Field label="Reason" htmlFor={`${prefix}-reason`} required>
          <TextInput
            id={`${prefix}-reason`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={1000}
          />
        </Field>
      ) : null}
      <div>
        <Button
          type="button"
          disabled={
            busy ||
            label.trim().length < 2 ||
            permissions.length === 0 ||
            (role ? reason.trim().length < 4 : code.length < 3)
          }
          onClick={async () => {
            setBusy(true);
            setError(null);
            const body = {
              label,
              ...(description.trim() ? { description } : {}),
              permissions,
            };
            try {
              if (role) {
                await api.put(`/roles/${role.code}`, {
                  ...body,
                  reason: reason.trim(),
                });
              } else {
                await api.post("/roles", { code, ...body });
                setCode("");
                setLabel("");
                setDescription("");
                setPermissions([]);
              }
              await onDone();
            } catch (caught) {
              const failure = explained(
                caught,
                role
                  ? "This role cannot be changed."
                  : "A role with that code already exists.",
              );
              setError(
                failure.status === 403
                  ? new ApiError(403, REFUSED, failure.requestId)
                  : failure,
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {role ? "Save changes" : "Create role"}
        </Button>
      </div>
    </div>
  );
}

export default function RolesPage() {
  const { holds } = useSession();
  const canManage = holds("role.manage");
  const [amending, setAmending] = useState<string | null>(null);

  const { data, error, isLoading, mutate } = useSWR<{ roles: RoleSummary[] }>(
    "/roles",
    fetcher,
  );
  const roles = data?.roles ?? [];
  const loadError = error instanceof ApiError ? error : null;

  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Officers</h1>
        <p className="mt-1 text-sm text-black/60">
          A role is a named set of permissions. It is given to an officer for a
          part of the Union, on the officer’s own page.
        </p>
      </div>

      <OfficerTabs />

      {loadError ? (
        <ErrorNotice
          message={loadError.message}
          requestId={loadError.requestId}
        />
      ) : null}
      {isLoading ? <p className="text-sm text-black/50">Loading…</p> : null}

      {roles.map((role) => (
        <Section
          key={role.code}
          title={role.label}
          description={role.description ?? undefined}
        >
          <div className="flex flex-wrap items-center gap-2 text-xs text-black/55">
            <span className="font-mono">{role.code}</span>
            <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5">
              {role.isSystem
                ? "Standard (PRD §16) — cannot be changed"
                : "Composed by the Union"}
            </span>
            <span>
              {role.assignmentCount === 0
                ? "Given to nobody"
                : role.assignmentCount === 1
                  ? "1 assignment"
                  : `${role.assignmentCount} assignments`}
            </span>
          </div>
          {amending === role.code ? (
            <RoleForm
              key={`${role.code}:${role.permissions.join()}`}
              role={role}
              onDone={async () => {
                await mutate();
                setAmending(null);
              }}
            />
          ) : (
            <>
              <ul className="grid gap-1 text-sm sm:grid-cols-2">
                {role.permissions.map((code) => (
                  <li key={code}>
                    {describe(code)}
                    {isGrantOnly(code) ? (
                      <span className="text-xs text-black/50">
                        {" "}
                        (this role only)
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {canManage && !role.isSystem ? (
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setAmending(role.code)}
                  >
                    Change this role
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </Section>
      ))}

      {canManage ? (
        <Section
          title="Compose a role"
          description="For work the standard roles do not fit. You can only put in permissions you hold yourself."
        >
          <RoleForm role={null} onDone={() => mutate()} />
        </Section>
      ) : null}
    </div>
  );
}
