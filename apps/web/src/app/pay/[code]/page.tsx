"use client";

import type { PublicPayPage, PublicPayStarted } from "@nurtw/contracts";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import useSWR from "swr";

import { naira } from "@/components/dues-panel";
import { Button, ErrorNotice, Field, TextInput } from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";

/**
 * The public pay page (PRD Requirement 27.8, revision 1.9; PAY-21 — item 31).
 *
 * Reached by a personal pay link an officer sends. It needs no sign-in, so it
 * must never say what is owed or paid: it offers the published amount for this
 * vehicle or member, the same whatever their dues stand at, and hands the
 * payer to Paystack. Nothing here confirms a payment either; that happens only
 * when Paystack tells the API (Requirement 27.5).
 */
export default function PayPage() {
  return (
    <main className="flex min-h-full flex-1 items-start justify-center bg-[var(--surface-muted)] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- a small, static public asset; next/image's build-time optimisation buys nothing here. */}
          <img
            src="/logo.png"
            alt="NURTW emblem"
            className="mx-auto mb-3 h-14 w-14 object-contain"
          />
          <h1 className="text-xl font-semibold tracking-tight">
            Pay NURTW dues
          </h1>
          <p className="mt-1 text-sm text-black/60">Anambra State Council</p>
        </div>
        {/* `useSearchParams` needs a boundary to render under. */}
        <Suspense fallback={<Notice>Loading…</Notice>}>
          <Pay />
        </Suspense>
      </div>
    </main>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-white p-6 text-sm">
      {children}
    </div>
  );
}

function Pay() {
  const { code } = useParams<{ code: string }>();
  const returned = useSearchParams().get("paid") === "1";
  const { data, error, isLoading } = useSWR<PublicPayPage>(
    `/pay/${encodeURIComponent(code)}`,
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const [chosen, setChosen] = useState<string | null>(null);
  const [payerEmail, setPayerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [payAgain, setPayAgain] = useState(false);

  if (isLoading) {
    return <Notice>Loading…</Notice>;
  }
  if (error || !data) {
    const status = error instanceof ApiError ? error.status : 0;
    return (
      <Notice>
        <p className="font-semibold">
          {status === 404
            ? "This pay link is not in use."
            : status === 429
              ? "Too many tries from this connection."
              : "The page could not be loaded."}
        </p>
        <p className="mt-1 text-black/65">
          {status === 404
            ? "It may have been replaced. Ask your NURTW office for the current one."
            : status === 429
              ? "Wait a little, then open the link again."
              : "Check your connection, then open the link again."}
        </p>
      </Notice>
    );
  }

  const option =
    data.options.find((entry) => entry.feeTypeCode === chosen) ??
    data.options[0] ??
    null;

  async function pay(event: FormEvent) {
    event.preventDefault();
    if (!option) {
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const started = await api.post<PublicPayStarted>(
        `/pay/${encodeURIComponent(code)}`,
        {
          feeTypeCode: option.feeTypeCode,
          payerEmail: payerEmail.trim(),
          returnUrl: `${window.location.origin}/pay/${encodeURIComponent(code)}?paid=1`,
        },
      );
      window.location.assign(started.authorizationUrl);
    } catch (caught) {
      const problem =
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "The service could not be reached.");
      setFailure(
        problem.status === 429
          ? new ApiError(
              429,
              "Too many payments were started from this connection. Wait a while and try again.",
              problem.requestId,
            )
          : problem.status === 503
            ? new ApiError(
                503,
                "The payment could not be started just now. Nothing has been taken. Please try again in a few minutes.",
                problem.requestId,
              )
            : problem.status === 404
              ? new ApiError(
                  404,
                  "This pay link is no longer in use. Ask your NURTW office for the current one.",
                  problem.requestId,
                )
              : problem,
      );
      setBusy(false);
    }
  }

  if (returned && !payAgain) {
    return (
      <Notice>
        <p className="font-semibold">Thank you.</p>
        <p className="mt-1 text-black/70">
          If your payment went through, Paystack has sent a receipt to your
          email, and NURTW counts the payment as soon as Paystack confirms it.
          Keep the receipt.
        </p>
        <div className="mt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setPayAgain(true)}
          >
            Make another payment
          </Button>
        </div>
      </Notice>
    );
  }

  return (
    <form
      onSubmit={pay}
      className="grid gap-4 rounded-lg border border-[var(--border-subtle)] bg-white p-6"
    >
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-black/45">
          {data.subjectType === "vehicle"
            ? "Paying for vehicle"
            : "Paying for member"}
        </p>
        <p className="mt-0.5 text-lg font-semibold">{data.label}</p>
        <p className="mt-1 text-sm text-black/60">
          Check this is yours before you pay.
        </p>
      </div>

      {!data.open || !option ? (
        <p className="rounded-md border border-[var(--verdict-caution)]/40 bg-[var(--verdict-caution-surface)] px-3 py-2 text-sm">
          Payments are not open yet. Please try again later, or ask your NURTW
          office.
        </p>
      ) : (
        <>
          {failure && failure.details.length === 0 ? (
            <ErrorNotice
              message={failure.message}
              requestId={failure.requestId}
            />
          ) : null}

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">What you are paying</legend>
            {data.options.map((entry) => (
              <label
                key={entry.feeTypeCode}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--border-subtle)] px-3 py-2.5 text-sm"
              >
                <input
                  type="radio"
                  name="fee"
                  className="mt-1"
                  checked={entry.feeTypeCode === option.feeTypeCode}
                  onChange={() => setChosen(entry.feeTypeCode)}
                />
                <span>
                  <span className="font-medium">{entry.label}</span>
                  <span className="block text-black/60">
                    {naira(entry.dueKobo)} + {naira(entry.feeKobo)} processing
                    fee
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <Field
            label="Your email"
            htmlFor="payerEmail"
            hint="Paystack sends your receipt here."
            required
            error={failure?.fieldError("payerEmail")}
          >
            <TextInput
              id="payerEmail"
              type="email"
              autoComplete="email"
              value={payerEmail}
              onChange={(event) => setPayerEmail(event.target.value)}
            />
          </Field>

          <Button type="submit" disabled={busy || !payerEmail.includes("@")}>
            {busy
              ? "Opening Paystack…"
              : `Pay ${naira(option.totalKobo)} with Paystack`}
          </Button>

          <p className="text-xs leading-relaxed text-black/55">
            Each payment is one{" "}
            {data.subjectType === "vehicle" ? "month" : "year"}. This page does
            not show earlier payments; your NURTW office can tell you where your
            account stands.
          </p>
        </>
      )}
    </form>
  );
}
