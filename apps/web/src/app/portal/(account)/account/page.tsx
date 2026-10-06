"use client";

import { useState, type FormEvent } from "react";

import {
  Button,
  ErrorNotice,
  Field,
  Notice,
  PageHeader,
  Section,
  TextInput,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { usePortalSession } from "@/lib/portal-session";

/**
 * The portal account's own password (item 29). On a temporary password the
 * administrator gave, this is the only page that opens until it is changed.
 */
export default function PortalAccountPage() {
  const { me, refresh } = usePortalSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);

  if (!me) {
    return null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailure(null);
    setSaved(false);
    try {
      await api.post("/portal/password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setSaved(true);
      await refresh();
    } catch (caught) {
      setFailure(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "The service could not be reached."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid max-w-xl gap-6">
      <PageHeader
        title="Account"
        meta={`${me.account.fullName} · ${me.account.email}`}
      />

      {me.account.mustChangePassword ? (
        <Notice tone="caution" title="Choose your own password" role="status">
          You signed in with a temporary one from the Union. Nothing else in the
          portal opens until you have changed it.
        </Notice>
      ) : null}

      <Section
        title="Password"
        description="Changing it signs this account out everywhere else."
      >
        <form onSubmit={submit} className="grid gap-4">
          {failure && failure.details.length === 0 ? (
            <ErrorNotice
              message={failure.message}
              requestId={failure.requestId}
            />
          ) : null}
          {saved ? (
            <p
              role="status"
              className="text-sm font-medium text-verdict-affirm"
            >
              Password changed.
            </p>
          ) : null}
          <Field
            label={
              me.account.mustChangePassword
                ? "Temporary password"
                : "Current password"
            }
            htmlFor="currentPassword"
            required
            error={failure?.fieldError("currentPassword")}
          >
            <TextInput
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </Field>
          <Field
            label="New password"
            htmlFor="newPassword"
            hint="At least 12 characters. Not your name or email address."
            required
            error={failure?.fieldError("newPassword")}
          >
            <TextInput
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </Field>
          <div>
            <Button
              type="submit"
              disabled={
                busy || currentPassword === "" || newPassword.length < 12
              }
            >
              Change the password
            </Button>
          </div>
        </form>
      </Section>
    </div>
  );
}
