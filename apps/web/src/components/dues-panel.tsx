"use client";

import type { DuesStatusCode, MemberDues, VehicleDues } from "@nurtw/contracts";
import { useState } from "react";
import useSWR from "swr";

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
 * Dues status (PRD Requirements 27.8, 27.13 — item 22).
 *
 * **Internal only.** It is shown beside a record to the System's own users and
 * appears on no public page. Nothing here blocks anything: an officer issuing a
 * card sees whether the fee is paid and decides for themselves (PAY-05).
 *
 * DESIGN.md §3 — the status is a word in a chip and a sentence beside it. The
 * tone only decorates; read in greyscale it still says PAID or IN ARREARS.
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

/** `2026-11` as "November 2026". */
function monthName(label: string): string {
  const [year, month] = label.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, 15)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

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

function Verdict({
  status,
  children,
}: {
  status: DuesStatusCode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <StatusChip status={status} />
      <p className="text-sm">{children}</p>
    </div>
  );
}

/**
 * Starts a payment link for a due, for an officer who may start payments.
 * The link opens Paystack; the due is credited only once Paystack confirms it.
 */
function PayLink({
  feeTypeCode,
  subjectType,
  subjectId,
  onRefresh,
}: {
  feeTypeCode: "LEVY" | "MEMBERSHIP";
  subjectType: "vehicle" | "member";
  subjectId: string;
  onRefresh: () => void;
}) {
  const { holds } = useSession();
  const [payerEmail, setPayerEmail] = useState("");
  const [link, setLink] = useState<{ url: string; totalKobo: number } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  if (!holds("payment.initiate")) {
    return null;
  }

  return (
    <div className="grid gap-3 border-t border-[var(--border-subtle)] pt-4">
      {error ? (
        <ErrorNotice message={error.message} requestId={error.requestId} />
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <Field
            label="Payer's email"
            htmlFor={`payer-${feeTypeCode}-${subjectId}`}
            hint="Paystack sends the receipt here."
          >
            <TextInput
              id={`payer-${feeTypeCode}-${subjectId}`}
              type="email"
              autoComplete="off"
              value={payerEmail}
              onChange={(event) => setPayerEmail(event.target.value)}
            />
          </Field>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !payerEmail.includes("@")}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const response = await api.post<{
                authorizationUrl: string;
                totalChargedKobo: number;
              }>("/payments/initiate", {
                feeTypeCode,
                subjectType,
                subjectId,
                payerEmail: payerEmail.trim(),
                callbackUrl: window.location.href,
              });
              setLink({
                url: response.authorizationUrl,
                totalKobo: response.totalChargedKobo,
              });
            } catch (caught) {
              if (caught instanceof ApiError) {
                setError(
                  caught.status === 400
                    ? new ApiError(
                        400,
                        "A payment link could not be created. Dues shared with the Union need the NURTW settlement account to be set up first.",
                        caught.requestId,
                        caught.details,
                      )
                    : caught,
                );
              }
            } finally {
              setBusy(false);
            }
          }}
        >
          Create payment link
        </Button>
      </div>
      {link ? (
        <p className="text-sm">
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline underline-offset-2"
          >
            Open the Paystack payment page
          </a>{" "}
          ({naira(link.totalKobo)} with the processing fee). The due is credited
          once Paystack confirms the payment.{" "}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={onRefresh}
          >
            Refresh
          </button>
        </p>
      ) : null}
    </div>
  );
}

/** The monthly levy on one vehicle. */
export function VehicleDuesPanel({ vehicleId }: { vehicleId: string }) {
  const { data, mutate } = useSWR<{ dues: VehicleDues }>(
    `/vehicles/${vehicleId}/dues`,
    fetcher,
  );
  const dues = data?.dues;
  if (!dues) {
    return null;
  }

  return (
    <Section
      title="Monthly levy"
      description="For the Union's own use: never shown on a scan to an outside organisation or on the public page."
    >
      <Verdict status={dues.status}>
        {dues.status === "NOT_DUE"
          ? dues.firstDueOn
            ? `Nothing has fallen due yet. The first levy falls due on ${day(dues.firstDueOn)}.`
            : "No levy yet: it starts the month after the vehicle is onboarded."
          : dues.status === "PAID"
            ? `Paid up. ${dues.monthsDue} month${dues.monthsDue === 1 ? "" : "s"} have fallen due.`
            : dues.status === "OWED"
              ? `This month's levy is unpaid: ${naira(dues.outstandingKobo)}.`
              : `${dues.unpaidMonths.length} months are unpaid: ${naira(dues.outstandingKobo)} in total.`}
      </Verdict>

      {dues.firstDueOn ? (
        <dl className="grid gap-4 sm:grid-cols-3">
          <Figure
            label="One month costs"
            value={naira(dues.currentAmountKobo)}
          />
          <Figure
            label="Next falls due"
            value={dues.nextDueOn ? day(dues.nextDueOn) : "—"}
          />
          <Figure label="Credit held" value={naira(dues.creditKobo)} />
        </dl>
      ) : null}

      {dues.unpaidMonths.length > 0 ? (
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-black/45">
            <tr>
              <th className="py-1.5 font-medium">Month</th>
              <th className="py-1.5 font-medium">Levy</th>
              <th className="py-1.5 font-medium">Paid</th>
              <th className="py-1.5 font-medium">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {dues.unpaidMonths.map((month) => (
              <tr
                key={month.month}
                className="border-t border-[var(--border-subtle)]"
              >
                <td className="py-1.5">{monthName(month.month)}</td>
                <td className="py-1.5">{naira(month.amountKobo)}</td>
                <td className="py-1.5">{naira(month.paidKobo)}</td>
                <td className="py-1.5 font-medium">
                  {naira(month.outstandingKobo)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {dues.firstDueOn ? (
        <PayLink
          feeTypeCode="LEVY"
          subjectType="vehicle"
          subjectId={vehicleId}
          onRefresh={() => void mutate()}
        />
      ) : null}
    </Section>
  );
}

/** The yearly membership fee for one member. */
export function MemberDuesPanel({ memberId }: { memberId: string }) {
  const { data, mutate } = useSWR<{ dues: MemberDues }>(
    `/members/${memberId}/dues`,
    fetcher,
  );
  const dues = data?.dues;
  if (!dues) {
    return null;
  }

  return (
    <Section
      title="Membership fee"
      description="For the Union's own use. It does not stop a card being issued or renewed: the issuing officer sees it and decides."
    >
      <Verdict status={dues.status}>
        {dues.status === "PAID" && dues.coveredUntil
          ? `Paid. Covered until ${day(dues.coveredUntil)}.`
          : dues.status === "OWED" && dues.owedSince
            ? `Unpaid since ${day(dues.owedSince)}: ${naira(dues.outstandingKobo)}${
                dues.heldKobo > 0
                  ? `, after ${naira(dues.heldKobo)} already received towards it`
                  : ""
              }.`
            : dues.notStartedBecause === "NO_GO_LIVE_DATE"
              ? "Not started. This member came from the previous system, and their fee starts on the go-live date, which has not been set."
              : dues.notStartedBecause === "NOT_APPROVED"
                ? "Not started. The fee falls due when the application is approved."
                : dues.firstDueOn
                  ? `Not yet due. It falls due on ${day(dues.firstDueOn)}.`
                  : "Not yet due."}
      </Verdict>

      {dues.status !== "NOT_DUE" || dues.firstDueOn ? (
        <PayLink
          feeTypeCode="MEMBERSHIP"
          subjectType="member"
          subjectId={memberId}
          onRefresh={() => void mutate()}
        />
      ) : null}
    </Section>
  );
}
