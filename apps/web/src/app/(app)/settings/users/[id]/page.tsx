"use client";

import {
  PERMISSIONS,
  type IssuedTemporaryPassword,
  type RoleSummary,
  type UserDetail,
  type UserScopedPermission,
} from "@nurtw/contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import useSWR from "swr";

import { explained, shortDay } from "@/components/api-access";
import {
  OrganisationPicker,
  TemporaryPassword,
  levelLabel,
} from "@/components/officers";
import {
  Button,
  ErrorNotice,
  Field,
  Section,
  Select,
  StatusChip,
  TextInput,
} from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { useSession } from "@/lib/session";

/**
 * One officer: their account, and what they may do (PRD §16, item 28).
 *
 * The controls offered follow the administrator's permissions. That is a
 * courtesy: the API refuses regardless, and it also refuses an administrator
 * changing their own access, and giving what they do not hold.
 */

const REFUSED =
  "The System refused this. You can only give a role or permission you hold yourself in that part of the Union, and you cannot change your own account here.";

function describe(code: string): string {
  return (
    PERMISSIONS.find((permission) => permission.code === code)?.description ??
    code
  );
}

function Reason({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <Field label="Reason" htmlFor={id} required>
      <TextInput
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={1000}
      />
    </Field>
  );
}

/** A list of roles, grants, or revocations, each with a remove control. */
function Entries({
  empty,
  children,
}: {
  empty: string;
  children: ReactNode[];
}) {
  return children.length === 0 ? (
    <p className="text-sm italic text-black/55">{empty}</p>
  ) : (
    <ul className="grid gap-2">{children}</ul>
  );
}

function ScopedEntry({
  entry,
  onRemove,
  removeLabel,
  disabled,
}: {
  entry: UserScopedPermission;
  onRemove: (() => void) | null;
  removeLabel: string;
  disabled: boolean;
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-[var(--border-subtle)] px-3 py-2">
      <div className="text-sm">
        <p className="font-medium">{describe(entry.permission)}</p>
        <p className="font-mono text-xs text-black/50">{entry.permission}</p>
        <p className="text-xs text-black/60">
          {entry.organisation.name} ({levelLabel(entry.organisation.level)}) ·{" "}
          {shortDay(entry.createdAt)}
          {entry.by ? ` · by ${entry.by.fullName}` : ""}
        </p>
        <p className="text-xs text-black/60">Reason: {entry.reason}</p>
      </div>
      {onRemove ? (
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          onClick={onRemove}
        >
          {removeLabel}
        </Button>
      ) : null}
    </li>
  );
}

export default function OfficerPage() {
  const params = useParams<{ id: string }>();
  const { user: me, holds } = useSession();
  const canManage = holds("user.manage");
  const canGrant = holds("permission.grant");
  const canRevoke = holds("permission.revoke");

  const { data, error, isLoading, mutate } = useSWR<{ user: UserDetail }>(
    `/users/${params.id}`,
    fetcher,
  );
  const officer = data?.user ?? null;
  const loadError = error instanceof ApiError ? error : null;

  const { data: roleList } = useSWR<{ roles: RoleSummary[] }>(
    canManage && holds("role.read") ? "/roles" : null,
    fetcher,
  );
  const roles = roleList?.roles ?? [];

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [issued, setIssued] = useState<string | null>(null);
  // One reason field serves the account actions; the others have their own.
  const [accountReason, setAccountReason] = useState("");
  const [roleCode, setRoleCode] = useState("");
  const [roleScope, setRoleScope] = useState("");
  const [roleReason, setRoleReason] = useState("");
  const [permission, setPermission] = useState("");
  const [permissionScope, setPermissionScope] = useState("");
  const [permissionReason, setPermissionReason] = useState("");
  const [removeReason, setRemoveReason] = useState("");

  async function act(action: () => Promise<unknown>, conflict: string) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      await mutate();
      return true;
    } catch (caught) {
      const failure = explained(caught, conflict);
      setActionError(
        failure.status === 403
          ? new ApiError(403, REFUSED, failure.requestId)
          : failure,
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-black/50">Loading…</p>;
  }
  if (!officer) {
    return (
      <div className="grid gap-4">
        <ErrorNotice
          message={
            loadError?.status === 404
              ? "No such officer."
              : (loadError?.message ?? "The officer could not be loaded.")
          }
          requestId={loadError?.requestId}
        />
        <Link
          href="/settings/users"
          className="text-sm underline underline-offset-2"
        >
          Back to officers
        </Link>
      </div>
    );
  }

  const isSelf = me?.id === officer.id;
  const chosenRole = roles.find((role) => role.code === roleCode);
  const hasReason = removeReason.trim().length >= 4;
  const base = `/users/${officer.id}`;

  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <Link
          href="/settings/users"
          className="text-sm text-black/55 underline-offset-2 hover:underline"
        >
          ← Officers
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">
            {officer.fullName}
          </h1>
          <StatusChip status={officer.isActive ? "ACTIVE" : "DEACTIVATED"} />
        </div>
        <p className="mt-1 text-sm text-black/60">
          {officer.email} · added {shortDay(officer.createdAt)}
        </p>
      </div>

      {issued ? (
        <TemporaryPassword
          password={issued}
          officerName={officer.fullName}
          onDone={() => setIssued(null)}
        />
      ) : null}

      {actionError ? (
        <ErrorNotice
          message={actionError.message}
          requestId={actionError.requestId}
        />
      ) : null}

      {isSelf ? (
        <p className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-3 text-sm">
          This is your own account. Another administrator changes your roles,
          permissions, and status. Your password and second factor are under{" "}
          <Link
            href="/account"
            className="font-medium underline underline-offset-2"
          >
            your account
          </Link>
          .
        </p>
      ) : null}

      <Section
        title="Roles"
        description="A role applies to the part of the Union named and everything beneath it."
      >
        <Entries empty="No role. This officer can sign in and do nothing else.">
          {officer.roles.map((role) => (
            <li
              key={role.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--border-subtle)] px-3 py-2"
            >
              <div className="text-sm">
                <p className="font-medium">{role.role.label}</p>
                <p className="text-xs text-black/60">
                  {role.organisation.name} (
                  {levelLabel(role.organisation.level)}) · since{" "}
                  {shortDay(role.createdAt)}
                </p>
              </div>
              {canManage && !isSelf ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || !hasReason}
                  onClick={() =>
                    void act(
                      () =>
                        api.post(`${base}/roles/${role.id}/remove`, {
                          reason: removeReason.trim(),
                        }),
                      "That role had already been removed.",
                    )
                  }
                >
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </Entries>

        {canManage && !isSelf ? (
          <div className="grid gap-4 border-t border-[var(--border-subtle)] pt-4">
            <Field label="Give a role" htmlFor="roleCode" required>
              <Select
                id="roleCode"
                value={roleCode}
                onChange={(event) => setRoleCode(event.target.value)}
              >
                <option value="">Select a role</option>
                {roles.map((role) => (
                  <option key={role.code} value={role.code}>
                    {role.label}
                    {role.isSystem ? "" : " (composed)"}
                  </option>
                ))}
              </Select>
            </Field>
            {chosenRole ? (
              <div className="rounded-md bg-[var(--surface-muted)] px-3 py-2 text-xs">
                {chosenRole.description ? (
                  <p className="mb-1.5 text-black/65">
                    {chosenRole.description}
                  </p>
                ) : null}
                <p className="text-black/60">
                  {chosenRole.permissions.map(describe).join(" · ")}
                </p>
              </div>
            ) : null}
            <OrganisationPicker
              id="roleScope"
              value={roleScope}
              onChange={setRoleScope}
            />
            <Reason
              id="roleReason"
              value={roleReason}
              onChange={setRoleReason}
            />
            <div>
              <Button
                type="button"
                disabled={
                  busy ||
                  !roleCode ||
                  !roleScope ||
                  roleReason.trim().length < 4
                }
                onClick={async () => {
                  const done = await act(
                    () =>
                      api.post(`${base}/roles`, {
                        roleCode,
                        organisationId: roleScope,
                        reason: roleReason.trim(),
                      }),
                    "The officer already holds that role there.",
                  );
                  if (done) {
                    setRoleCode("");
                    setRoleReason("");
                  }
                }}
              >
                Give role
              </Button>
            </div>
          </div>
        ) : null}
      </Section>

      <Section
        title="Single permissions"
        description="A permission granted to this officer alone, beyond their roles, or revoked from them whatever their roles give. A revocation always wins."
      >
        <div className="grid gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-black/45">
            Granted
          </p>
          <Entries empty="None granted.">
            {officer.grants.map((grant) => (
              <ScopedEntry
                key={grant.id}
                entry={grant}
                removeLabel="Withdraw"
                disabled={busy || !hasReason}
                onRemove={
                  canGrant && !isSelf
                    ? () =>
                        void act(
                          () =>
                            api.post(`${base}/grants/${grant.id}/withdraw`, {
                              reason: removeReason.trim(),
                            }),
                          "That grant had already been withdrawn.",
                        )
                    : null
                }
              />
            ))}
          </Entries>
        </div>
        <div className="grid gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-black/45">
            Revoked
          </p>
          <Entries empty="None revoked.">
            {officer.revocations.map((revocation) => (
              <ScopedEntry
                key={revocation.id}
                entry={revocation}
                removeLabel="Lift"
                disabled={busy || !hasReason}
                onRemove={
                  canRevoke && !isSelf
                    ? () =>
                        void act(
                          () =>
                            api.post(
                              `${base}/revocations/${revocation.id}/lift`,
                              { reason: removeReason.trim() },
                            ),
                          "That revocation had already been lifted.",
                        )
                    : null
                }
              />
            ))}
          </Entries>
        </div>

        {(canGrant || canRevoke) && !isSelf ? (
          <div className="grid gap-4 border-t border-[var(--border-subtle)] pt-4">
            <Field label="Permission" htmlFor="permission" required>
              <Select
                id="permission"
                value={permission}
                onChange={(event) => setPermission(event.target.value)}
              >
                <option value="">Select a permission</option>
                {PERMISSIONS.map((entry) => (
                  <option key={entry.code} value={entry.code}>
                    {entry.description} ({entry.code})
                  </option>
                ))}
              </Select>
            </Field>
            <OrganisationPicker
              id="permissionScope"
              value={permissionScope}
              onChange={setPermissionScope}
            />
            <Reason
              id="permissionReason"
              value={permissionReason}
              onChange={setPermissionReason}
            />
            <div className="flex flex-wrap gap-3">
              {(
                [
                  ["grants", "Grant", canGrant, "primary"],
                  ["revocations", "Revoke", canRevoke, "danger"],
                ] as const
              ).map(([path, label, allowed, variant]) =>
                allowed ? (
                  <Button
                    key={path}
                    type="button"
                    variant={variant}
                    disabled={
                      busy ||
                      !permission ||
                      !permissionScope ||
                      permissionReason.trim().length < 4
                    }
                    onClick={async () => {
                      const done = await act(
                        () =>
                          api.post(`${base}/${path}`, {
                            permission,
                            organisationId: permissionScope,
                            reason: permissionReason.trim(),
                          }),
                        "That is already in place there.",
                      );
                      if (done) {
                        setPermission("");
                        setPermissionReason("");
                      }
                    }}
                  >
                    {label}
                  </Button>
                ) : null,
              )}
            </div>
          </div>
        ) : null}
      </Section>

      {(canManage || canGrant || canRevoke) && !isSelf ? (
        <Section
          title="Reason for removing"
          description="Removing a role, withdrawing a grant, or lifting a revocation above needs a reason, recorded in the audit trail."
        >
          <Reason
            id="removeReason"
            value={removeReason}
            onChange={setRemoveReason}
          />
        </Section>
      ) : null}

      {canManage && !isSelf ? (
        <Section
          title="Account"
          description="A reason is required and recorded for each of these."
        >
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-black/45">
                Password
              </dt>
              <dd className="mt-0.5">
                {officer.mustChangePassword
                  ? "On a temporary password"
                  : "Chosen by the officer"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-black/45">
                Second factor
              </dt>
              <dd className="mt-0.5">
                {officer.secondFactorEnrolled ? "Set up" : "Not set up"}
              </dd>
            </div>
          </dl>
          <Reason
            id="accountReason"
            value={accountReason}
            onChange={setAccountReason}
          />
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={busy || accountReason.trim().length < 4}
              onClick={async () => {
                setBusy(true);
                setActionError(null);
                try {
                  const reset = await api.post<IssuedTemporaryPassword>(
                    `${base}/password/reset`,
                    { reason: accountReason.trim() },
                  );
                  setIssued(reset.temporaryPassword);
                  setAccountReason("");
                  await mutate();
                } catch (caught) {
                  setActionError(
                    explained(caught, "The password could not be reset."),
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Issue a temporary password
            </Button>
            {officer.secondFactorEnrolled ? (
              <Button
                type="button"
                variant="secondary"
                disabled={busy || accountReason.trim().length < 4}
                onClick={async () => {
                  const done = await act(
                    () =>
                      api.post(`${base}/mfa/reset`, {
                        reason: accountReason.trim(),
                      }),
                    "The officer has no second factor set up.",
                  );
                  if (done) {
                    setAccountReason("");
                  }
                }}
              >
                Remove second factor
              </Button>
            ) : null}
            <Button
              type="button"
              variant={officer.isActive ? "danger" : "primary"}
              disabled={busy || accountReason.trim().length < 4}
              onClick={async () => {
                const done = await act(
                  () =>
                    api.post(`${base}/status`, {
                      isActive: !officer.isActive,
                      reason: accountReason.trim(),
                    }),
                  "The account's status has changed since the page loaded.",
                );
                if (done) {
                  setAccountReason("");
                }
              }}
            >
              {officer.isActive ? "Deactivate" : "Reactivate"}
            </Button>
          </div>
          <p className="text-xs text-black/55">
            Deactivating signs the officer out at once and keeps the account and
            its history. Removing the second factor is for a lost phone: the
            officer sets it up again.
          </p>
        </Section>
      ) : null}
    </div>
  );
}
