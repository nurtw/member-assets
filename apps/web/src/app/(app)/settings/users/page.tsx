"use client";

import type { IssuedTemporaryPassword, UserSummary } from "@nurtw/contracts";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { explained } from "@/components/api-access";
import { TemporaryPassword, levelLabel } from "@/components/officers";
import {
  Button,
  ErrorNotice,
  Field,
  Section,
  StatusChip,
  TextInput,
} from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { useSession } from "@/lib/session";

/**
 * Officer accounts (PRD §16, item 28).
 *
 * Creating an account gives the officer a way in and nothing more: it starts
 * with no role. Roles and single permissions are given on the officer's own
 * page, each within a part of the Union.
 */

function CreateForm({
  onCreated,
}: {
  onCreated: (issued: IssuedTemporaryPassword) => Promise<unknown>;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  return (
    <Section
      title="Add an officer"
      description="The System issues a temporary password for you to pass on. The officer chooses their own at first sign-in. The account starts with no role."
    >
      {error && error.details.length === 0 ? (
        <ErrorNotice message={error.message} requestId={error.requestId} />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Full name"
          htmlFor="officerName"
          required
          error={error?.fieldError("fullName")}
        >
          <TextInput
            id="officerName"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            maxLength={200}
          />
        </Field>
        <Field
          label="Official email address"
          htmlFor="officerEmail"
          required
          hint="What they sign in with."
          error={error?.fieldError("email")}
        >
          <TextInput
            id="officerEmail"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
      </div>
      <div>
        <Button
          type="button"
          disabled={busy || fullName.trim().length < 2 || !email.includes("@")}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const issued = await api.post<IssuedTemporaryPassword>("/users", {
                fullName,
                email,
              });
              setFullName("");
              setEmail("");
              await onCreated(issued);
            } catch (caught) {
              setError(
                explained(caught, "An account with that email already exists."),
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Add officer
        </Button>
      </div>
    </Section>
  );
}

export default function OfficersPage() {
  const { holds } = useSession();
  const [issued, setIssued] = useState<IssuedTemporaryPassword | null>(null);

  const { data, error, isLoading, mutate } = useSWR<{ users: UserSummary[] }>(
    holds("user.read") ? "/users" : null,
    fetcher,
  );
  const users = data?.users ?? [];
  const loadError = error instanceof ApiError ? error : null;

  return (
    <div className="grid max-w-5xl gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Officers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Who may sign in, and what each may do. Every change needs a reason and
          is recorded in the audit trail.
        </p>
      </div>

      {issued ? (
        <TemporaryPassword
          password={issued.temporaryPassword}
          officerName={issued.user.fullName}
          onDone={() => setIssued(null)}
        />
      ) : null}

      {loadError ? (
        <ErrorNotice
          message={loadError.message}
          requestId={loadError.requestId}
        />
      ) : null}
      {isLoading ? (
        <p className="text-sm text-faint-foreground">Loading…</p>
      ) : null}

      {users.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="border-b border-line bg-surface-muted text-left">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Officer</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Roles</th>
                <th className="px-4 py-2.5 font-semibold">Second factor</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-line last:border-0 hover:bg-surface-muted/60"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/settings/users/${user.id}`}
                      className="font-medium text-link underline-offset-2 hover:underline"
                    >
                      {user.fullName}
                    </Link>
                    <span className="block text-xs text-faint-foreground">
                      {user.email}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip
                      status={user.isActive ? "ACTIVE" : "DEACTIVATED"}
                    />
                    {user.mustChangePassword ? (
                      <span className="mt-1 block text-xs text-faint-foreground">
                        On a temporary password
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {user.roles.length === 0 ? (
                      <span className="text-xs italic text-faint-foreground">
                        None
                      </span>
                    ) : (
                      <ul className="grid gap-0.5">
                        {user.roles.map((role) => (
                          <li key={role.id}>
                            {role.role.label}
                            <span className="text-xs text-faint-foreground">
                              {" "}
                              · {role.organisation.name} (
                              {levelLabel(role.organisation.level)})
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {user.secondFactorEnrolled ? "Set up" : "Not set up"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {holds("user.manage") ? (
        <CreateForm
          onCreated={async (created) => {
            setIssued(created);
            await mutate();
          }}
        />
      ) : null}
    </div>
  );
}
