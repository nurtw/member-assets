"use client";

import type {
  SecondFactorConfirmed,
  SecondFactorEnrolment,
} from "@nurtw/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { mutate } from "swr";

import {
  Button,
  ErrorNotice,
  Field,
  PageHeader,
  Section,
  TextInput,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { useSession } from "@/lib/session";

/**
 * The officer's own account (item 28): their password and their second
 * factor. Every officer reaches it, whatever they hold, including one still
 * on a temporary password, who can reach nothing else.
 *
 * A key and its recovery codes are shown here once and held in this page's
 * state only. Leaving the page loses them, which is the point.
 */

function failure(caught: unknown): ApiError {
  return caught instanceof ApiError
    ? caught
    : new ApiError(0, "The service could not be reached.");
}

function PasswordForm({ temporary }: { temporary: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const mismatch = again.length > 0 && again !== next;

  return (
    <Section
      title={temporary ? "Choose your password" : "Change your password"}
      description={
        temporary
          ? "You signed in with a temporary password. Choose your own to continue: nothing else is available until you do."
          : "Changing it signs you out everywhere else."
      }
    >
      {error && error.details.length === 0 ? (
        <ErrorNotice
          message={
            error.status === 401
              ? "The current password was not accepted."
              : error.message
          }
          requestId={error.requestId}
        />
      ) : null}
      {done ? (
        <p role="status" className="text-sm font-medium">
          Your password has been changed.
        </p>
      ) : null}
      <Field
        label={temporary ? "Temporary password" : "Current password"}
        htmlFor="currentPassword"
        required
      >
        <TextInput
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="New password"
          htmlFor="newPassword"
          required
          hint="At least 12 characters. A few unrelated words work well. Do not use your name or email."
          error={error?.fieldError("newPassword")}
        >
          <TextInput
            id="newPassword"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
        </Field>
        <Field
          label="New password again"
          htmlFor="newPasswordAgain"
          required
          error={mismatch ? "The two do not match." : undefined}
        >
          <TextInput
            id="newPasswordAgain"
            type="password"
            autoComplete="new-password"
            value={again}
            onChange={(event) => setAgain(event.target.value)}
          />
        </Field>
      </div>
      <div>
        <Button
          type="button"
          disabled={busy || !current || next.length < 12 || again !== next}
          onClick={async () => {
            setBusy(true);
            setError(null);
            setDone(false);
            try {
              await api.post("/auth/password", {
                currentPassword: current,
                newPassword: next,
              });
              setCurrent("");
              setNext("");
              setAgain("");
              setDone(true);
              await mutate("/auth/me");
              if (temporary) {
                router.replace("/applications");
              }
            } catch (caught) {
              setError(failure(caught));
            } finally {
              setBusy(false);
            }
          }}
        >
          {temporary ? "Set password and continue" : "Change password"}
        </Button>
      </div>
    </Section>
  );
}

function RecoveryCodes({
  codes,
  onDone,
}: {
  codes: string[];
  onDone: () => void;
}) {
  return (
    <div className="rounded-lg border-2 border-verdict-caution bg-verdict-caution-surface p-5">
      <h3 className="text-base font-semibold">
        Keep these recovery codes — they will not be shown again
      </h3>
      <p className="mt-1 text-sm">
        Each works once in place of your authenticator app, if your phone is
        lost. Write them down or print them, and keep them away from your
        password.
      </p>
      <ul className="mt-3 grid gap-1.5 font-mono text-sm sm:grid-cols-2">
        {codes.map((code) => (
          <li
            key={code}
            className="select-all rounded-md border border-line bg-surface px-3 py-1.5"
          >
            {code}
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <Button type="button" variant="secondary" onClick={onDone}>
          I have kept them
        </Button>
      </div>
    </div>
  );
}

function SecondFactor() {
  const { account } = useSession();
  const [enrolment, setEnrolment] = useState<SecondFactorEnrolment | null>(
    null,
  );
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  if (!account) {
    return null;
  }
  const { enrolled, verified, required } = account.secondFactor;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await mutate("/auth/me");
    } catch (caught) {
      setError(failure(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Second factor"
      description="A code from an authenticator app on your phone, asked for when you sign in. It is required for administrative work, so that a stolen password alone is not enough."
    >
      {error ? (
        <ErrorNotice
          message={
            error.fieldError("code") ??
            (error.status === 503
              ? "The second factor is not configured on this System yet. Tell the administrator."
              : error.status === 403
                ? "Enter a code from your current authenticator first."
                : error.message)
          }
          requestId={error.requestId}
        />
      ) : null}

      <p className="text-sm">
        <span className="font-medium">
          {enrolled ? "Set up." : "Not set up."}
        </span>{" "}
        {enrolled
          ? verified
            ? "This session has proved it."
            : "This session has not proved it yet."
          : required
            ? "You hold administrative permissions, which need it."
            : "It is optional for you, and recommended."}
      </p>

      {codes ? (
        <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />
      ) : null}

      {enrolled && !verified ? (
        <div className="grid gap-3 border-t border-line pt-4">
          <Field
            label="Code from your authenticator app"
            htmlFor="verifyCode"
            hint="Or one of your recovery codes."
          >
            <TextInput
              id="verifyCode"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </Field>
          <div>
            <Button
              type="button"
              disabled={busy || code.trim().length < 6}
              onClick={() =>
                void run(async () => {
                  await api.post("/auth/mfa/verify", { code: code.trim() });
                  setCode("");
                })
              }
            >
              Prove it for this session
            </Button>
          </div>
        </div>
      ) : null}

      {enrolment ? (
        <div className="grid gap-3 border-t border-line pt-4">
          <p className="text-sm">
            In your authenticator app (Google Authenticator, Microsoft
            Authenticator, Authy, or similar), add an account and enter this
            key. On a phone, the link below opens the app directly.
          </p>
          <p
            className="select-all break-all rounded-md border border-line bg-surface-muted px-3 py-2 font-mono text-sm"
            aria-label="Authenticator key"
          >
            {enrolment.secret.match(/.{4}/g)?.join(" ")}
          </p>
          <p className="text-sm">
            <a
              href={enrolment.otpauthUri}
              className="font-medium underline underline-offset-2"
            >
              Open in my authenticator app
            </a>
          </p>
          <Field
            label="Code the app now shows"
            htmlFor="confirmCode"
            required
            hint="Six digits. This confirms the app is set up before it is required."
          >
            <TextInput
              id="confirmCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={busy || code.trim().length < 6}
              onClick={() =>
                void run(async () => {
                  const confirmed = await api.post<SecondFactorConfirmed>(
                    "/auth/mfa/confirm",
                    { code: code.trim() },
                  );
                  setCodes(confirmed.recoveryCodes);
                  setEnrolment(null);
                  setCode("");
                })
              }
            >
              Confirm
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setEnrolment(null);
                setCode("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3 border-t border-line pt-4">
          {!enrolled || verified ? (
            <Button
              type="button"
              variant={enrolled ? "secondary" : "primary"}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setEnrolment(
                    await api.post<SecondFactorEnrolment>("/auth/mfa/enrol"),
                  );
                })
              }
            >
              {enrolled
                ? "Move to another phone"
                : "Set up an authenticator app"}
            </Button>
          ) : null}
          {enrolled && verified ? (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const replaced = await api.post<SecondFactorConfirmed>(
                    "/auth/mfa/recovery-codes",
                  );
                  setCodes(replaced.recoveryCodes);
                })
              }
            >
              Get new recovery codes
            </Button>
          ) : null}
        </div>
      )}
    </Section>
  );
}

export default function AccountPage() {
  const { user, account } = useSession();
  if (!user || !account) {
    return null;
  }

  return (
    <div className="grid max-w-2xl gap-6">
      <PageHeader
        title="Your account"
        meta={`${user.fullName} · ${user.email}`}
      />
      <PasswordForm temporary={account.mustChangePassword} />
      {account.mustChangePassword ? null : <SecondFactor />}
    </div>
  );
}
