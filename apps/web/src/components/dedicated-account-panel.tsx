"use client";

import type {
  DedicatedAccountState,
  DedicatedAccountUnassignableReason,
} from "@nurtw/contracts";
import { useState } from "react";
import useSWR from "swr";

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
 * A member's dedicated account (PRD Requirement 27.7 — item 23).
 *
 * An ordinary bank account number the member pays NURTW dues into, from any
 * bank app or POS agent (PAY-17). The money splits at Paystack and settles
 * straight to the Union (PAY-11), pays the oldest dues first (PAY-12), and
 * anything over is held for the next due.
 *
 * **Internal only**, like dues (Requirement 27.8).
 */

function naira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Lagos",
  });
}

/** A levy month (`2026-11`) or a membership due date (`2026-11-10`), in words. */
function periodName(period: string): string {
  const [year, month, date] = period.split("-").map(Number);
  if (!year || !month) {
    return period;
  }
  return date
    ? `fell due ${new Date(
        Date.UTC(year, month - 1, date, 12),
      ).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })}`
    : new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      });
}

/**
 * The API's 409 is generic (Requirement 14.3); the reason comes from the
 * state it already returned, so the screen can say what to do about it.
 */
const UNASSIGNABLE: Record<DedicatedAccountUnassignableReason, string> = {
  ALREADY_ASSIGNED: "This member already has a dedicated account.",
  NOT_ACTIVE_MEMBER:
    "Only an approved, active member can be given a dedicated account.",
  NO_PHONE_ON_RECORD:
    "Paystack needs the member's phone number to open an account, and none is on record.",
  NO_SETTLEMENT_ACCOUNT:
    "The NURTW settlement account has not been set up yet, so there is nowhere for the money to settle.",
  NO_CONTRACTOR_PERCENTAGE:
    "Dedicated accounts are not switched on yet: the processing percentage has to be confirmed from the Paystack dashboard and set first.",
};

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-black/45">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}

function AssignForm({
  memberId,
  onAssigned,
}: {
  memberId: string;
  onAssigned: () => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  return (
    <div className="grid gap-3">
      {error ? (
        <ErrorNotice message={error.message} requestId={error.requestId} />
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <Field
            label="Email for Paystack"
            htmlFor={`dva-email-${memberId}`}
            hint="Paystack needs an email for the account holder. Use the member's, or the Union office's."
          >
            <TextInput
              id={`dva-email-${memberId}`}
              type="email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !email.includes("@")}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api.post(`/members/${memberId}/dedicated-account`, {
                email: email.trim(),
              });
              onAssigned();
            } catch (caught) {
              if (caught instanceof ApiError) {
                setError(
                  caught.status === 502
                    ? new ApiError(
                        502,
                        "Paystack did not open the account. Try again later; if it keeps failing, check the Paystack dashboard.",
                        caught.requestId,
                        caught.details,
                      )
                    : caught.status === 409
                      ? new ApiError(
                          409,
                          "The account could not be opened. The reason is shown above.",
                          caught.requestId,
                          caught.details,
                        )
                      : caught,
                );
                if (caught.status === 409) {
                  onAssigned();
                }
              }
            } finally {
              setBusy(false);
            }
          }}
        >
          Open a dedicated account
        </Button>
      </div>
    </div>
  );
}

export function DedicatedAccountPanel({ memberId }: { memberId: string }) {
  const { holds } = useSession();
  const { data, mutate } = useSWR<{ dedicatedAccount: DedicatedAccountState }>(
    `/members/${memberId}/dedicated-account`,
    fetcher,
  );
  const state = data?.dedicatedAccount;
  if (!state) {
    return null;
  }
  const account = state.account;

  return (
    <Section
      title="Dedicated account"
      description="A bank account number this member can pay NURTW dues into from any bank app or POS agent. The money settles straight to the Union and pays the oldest dues first."
    >
      {account ? (
        <>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-black/45">
                Account number
              </dt>
              <dd className="mt-0.5 font-mono text-lg font-semibold tracking-wider">
                {account.accountNumber}
              </dd>
            </div>
            <Figure label="Bank" value={account.bankName} />
            <Figure label="Account name" value={account.accountName} />
          </dl>

          <div className="grid gap-1 text-sm">
            {state.owedNow.creditKobo > 0 ? (
              <p>
                <span className="font-semibold">
                  To clear everything owed now (
                  {naira(state.owedNow.creditKobo)}), send{" "}
                  {state.owedNow.sendKobo === null
                    ? "—"
                    : naira(state.owedNow.sendKobo)}
                  .
                </span>
              </p>
            ) : (
              <p>Nothing is owed now.</p>
            )}
            {state.monthlyLevy.map((levy) => (
              <p key={levy.vehicleId}>
                One month&apos;s levy on {levy.plate} ({naira(levy.creditKobo)}
                ): send {levy.sendKobo === null ? "—" : naira(levy.sendKobo)}.
              </p>
            ))}
            {state.contractorPercentage !== null ? (
              <p className="text-black/60">
                Paystack keeps {state.contractorPercentage}% of each transfer
                for processing, so these amounts are a little more than the dues
                themselves.
              </p>
            ) : null}
            {state.heldCreditKobo > 0 ? (
              <p>
                {naira(state.heldCreditKobo)} has been received and is held for
                the next due to fall.
              </p>
            ) : null}
          </div>

          {state.transfers.length > 0 ? (
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-black/45">
                <tr>
                  <th className="py-1.5 font-medium">Received</th>
                  <th className="py-1.5 font-medium">Sent</th>
                  <th className="py-1.5 font-medium">Credited</th>
                  <th className="py-1.5 font-medium">Paid towards</th>
                </tr>
              </thead>
              <tbody>
                {state.transfers.map((transfer) => (
                  <tr
                    key={transfer.reference}
                    className="border-t border-[var(--border-subtle)] align-top"
                  >
                    <td className="py-1.5">{day(transfer.receivedAt)}</td>
                    <td className="py-1.5">{naira(transfer.amountKobo)}</td>
                    <td className="py-1.5">{naira(transfer.creditKobo)}</td>
                    <td className="py-1.5">
                      <ul className="grid gap-0.5">
                        {transfer.allocations.map((allocation, index) => (
                          <li key={index}>
                            {allocation.label}, {periodName(allocation.period)}:{" "}
                            {naira(allocation.amountKobo)}
                          </li>
                        ))}
                        {transfer.heldKobo > 0 ? (
                          <li className="text-black/60">
                            Held: {naira(transfer.heldKobo)}
                          </li>
                        ) : null}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-black/60">
              Nothing has been received yet.
            </p>
          )}
        </>
      ) : state.unassignableBecause ? (
        <p className="text-sm">{UNASSIGNABLE[state.unassignableBecause]}</p>
      ) : holds("payment.initiate") ? (
        <AssignForm memberId={memberId} onAssigned={() => void mutate()} />
      ) : (
        <p className="text-sm">This member has no dedicated account yet.</p>
      )}
    </Section>
  );
}

/**
 * The account to transfer to and the amount to send, in a line or two, for the
 * Verify page's Pay now (item 31). Nothing when the member has no dedicated
 * account, or the officer may not read payments.
 */
export function DedicatedAccountSummary({ memberId }: { memberId: string }) {
  const { holds } = useSession();
  const { data } = useSWR<{ dedicatedAccount: DedicatedAccountState }>(
    holds("payment.read") ? `/members/${memberId}/dedicated-account` : null,
    fetcher,
    { shouldRetryOnError: false },
  );
  const state = data?.dedicatedAccount;
  if (!state?.account) {
    return null;
  }
  const send = state.owedNow.sendKobo;

  return (
    <div className="grid gap-1 border-t border-[var(--border-subtle)] pt-4 text-sm">
      <h3 className="font-semibold">Or by bank transfer</h3>
      <p>
        <span className="font-mono text-base font-semibold tracking-wider">
          {state.account.accountNumber}
        </span>{" "}
        · {state.account.bankName} · {state.account.accountName}
      </p>
      <p className="text-black/60">
        {send !== null && send > 0
          ? `To clear what is owed now, send ${naira(send)}.`
          : "Anything sent is held towards the next due."}{" "}
        The member&apos;s own account: it settles straight to the Union.
      </p>
    </div>
  );
}
