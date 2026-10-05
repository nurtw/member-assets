"use client";

import type { SecuritySettings } from "@nurtw/contracts";
import Link from "next/link";
import { useState } from "react";
import useSWR, { mutate as mutateGlobal } from "swr";

import { explained } from "@/components/api-access";
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
 * The second-factor requirement (PRD Requirement 17.1, item 28).
 *
 * It starts off, so that no administrator is locked out before setting an
 * authenticator up, and must be on at go-live. This screen shows who it would
 * stop, and turns it on once they have enrolled.
 */
export default function SecurityPage() {
  const { account } = useSession();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<ApiError | null>(null);

  const { data, error, isLoading, mutate } = useSWR<SecuritySettings>(
    "/settings/security",
    fetcher,
  );
  const loadError = error instanceof ApiError ? error : null;
  const enforced = data?.secondFactorEnforced ?? false;
  const without = data?.privilegedWithoutSecondFactor ?? [];
  const verified = account?.secondFactor.verified === true;

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader
        title="Security"
        description="Whether administrative work needs a second factor: a code from an authenticator app, as well as a password."
      />

      {loadError ? (
        <ErrorNotice
          message={
            loadError.status === 403
              ? "Prove your second factor on your account page to open this screen."
              : loadError.message
          }
          requestId={loadError.requestId}
        />
      ) : null}
      {isLoading ? <Loading /> : null}

      {data ? (
        <>
          <Section
            title={
              enforced
                ? "A second factor is required for administrative work"
                : "A second factor is not yet required"
            }
            description={
              enforced
                ? "An officer cannot manage accounts, roles, permissions, outside organisations, limits, or the settlement account, or declare a vehicle, in a session that has not proved a second factor."
                : "Officers who have set one up are asked for it at sign-in, but administrative work does not yet demand it. Turn this on before go-live, once the officers below have set theirs up."
            }
          >
            {actionError ? (
              <ErrorNotice
                message={actionError.message}
                requestId={actionError.requestId}
              />
            ) : null}
            {!enforced && !verified ? (
              <p className="rounded-md border border-verdict-caution/40 bg-verdict-caution-surface px-3 py-2 text-sm">
                Set up and prove your own second factor first, on{" "}
                <Link
                  href="/account"
                  className="font-medium underline underline-offset-2"
                >
                  your account
                </Link>
                . Otherwise turning this on would lock you out of turning it
                off.
              </p>
            ) : null}
            <Field label="Reason" htmlFor="enforceReason" required>
              <TextInput
                id="enforceReason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={1000}
              />
            </Field>
            <div>
              <Button
                type="button"
                variant={enforced ? "danger" : "primary"}
                disabled={
                  busy || reason.trim().length < 4 || (!enforced && !verified)
                }
                onClick={async () => {
                  setBusy(true);
                  setActionError(null);
                  try {
                    await api.put("/settings/security/second-factor", {
                      enforced: !enforced,
                      reason: reason.trim(),
                    });
                    setReason("");
                    await mutate();
                    await mutateGlobal("/auth/me");
                  } catch (caught) {
                    setActionError(
                      explained(
                        caught,
                        "It could not be changed: it is already in that state, or this session has not proved a second factor.",
                      ),
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {enforced ? "Stop requiring it" : "Require a second factor"}
              </Button>
            </div>
          </Section>

          <Section
            title="Officers this stops"
            description="Active officers who hold an administrative permission and have not set a second factor up. Each must set one up on their own account page."
          >
            {without.length === 0 ? (
              <p className="text-sm italic text-faint-foreground">
                None. Every officer with administrative permissions has a second
                factor.
              </p>
            ) : (
              <ul className="grid gap-1.5 text-sm">
                {without.map((officer) => (
                  <li key={officer.id}>
                    <Link
                      href={`/settings/users/${officer.id}`}
                      className="font-medium text-link underline-offset-2 hover:underline"
                    >
                      {officer.fullName}
                    </Link>
                    <span className="text-faint-foreground">
                      {" "}
                      · {officer.email}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      ) : null}
    </div>
  );
}
