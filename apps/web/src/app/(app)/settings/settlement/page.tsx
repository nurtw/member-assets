"use client";

import type {
  PaystackBank,
  ResolvedSettlementAccount,
  SettlementState,
} from "@nurtw/contracts";
import { amountToSendKobo, dedicatedCreditKobo } from "@nurtw/domain";
import { useState } from "react";
import useSWR, { type KeyedMutator } from "swr";

import { moment } from "@/components/api-access";
import { naira } from "@/components/dues-panel";
import {
  Button,
  ErrorNotice,
  Field,
  Section,
  Select,
  TextInput,
} from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";

/**
 * The NURTW settlement account and the dedicated-account percentage (PRD
 * Requirements 27.7 and 27.12, item 30).
 *
 * Changing the account redirects all of the Union's dues, so the bank comes
 * from Paystack's list, the account name is shown before anything is saved,
 * and saving needs the officer's password and a reason. The API audits every
 * attempt, and the lookup too.
 */
export default function SettlementPage() {
  const { data, error, isLoading, mutate } = useSWR<SettlementState>(
    "/payments/settlement",
    fetcher,
  );
  const loadError = error instanceof ApiError ? error : null;

  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settlement</h1>
        <p className="mt-1 text-sm text-black/60">
          Where the Union&apos;s share of every payment is paid, and the
          contractor&apos;s percentage of money sent to members&apos; dedicated
          accounts.
        </p>
      </div>

      {loadError ? (
        <ErrorNotice
          message={
            loadError.status === 403
              ? "Only an officer holding the settlement permission can open this screen. Once a second factor is required, prove yours on your account page first."
              : loadError.message
          }
          requestId={loadError.requestId}
        />
      ) : null}
      {isLoading ? <p className="text-sm text-black/50">Loading…</p> : null}

      {data ? (
        <>
          <AccountSection state={data} mutate={mutate} />
          <PercentageSection state={data} mutate={mutate} />
        </>
      ) : null}
    </div>
  );
}

function AccountSection({
  state,
  mutate,
}: {
  state: SettlementState;
  mutate: KeyedMutator<SettlementState>;
}) {
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [resolved, setResolved] = useState<{
    key: string;
    name: string;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: bankList, error: bankError } = useSWR<{
    banks: PaystackBank[];
  }>("/payments/banks", fetcher);
  const banks = bankList?.banks ?? [];
  const bank = banks.find((entry) => entry.code === bankCode);

  const key = `${bankCode}:${accountNumber}`;
  const wellFormed = bankCode !== "" && /^\d{10}$/.test(accountNumber);
  // A name confirmed for different inputs confirms nothing.
  const confirmedName = resolved?.key === key ? resolved.name : null;
  const current = state.account;

  async function lookUp() {
    setBusy(true);
    setFailure(null);
    setSaved(false);
    try {
      const answer = await api.post<ResolvedSettlementAccount>(
        "/payments/settlement/resolve",
        { bankCode, accountNumber },
      );
      setResolved({ key, name: answer.accountName });
    } catch (caught) {
      setResolved(null);
      setFailure(asApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!bank) {
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const next = await api.post<SettlementState>("/payments/settlement", {
        bankCode,
        bankName: bank.name,
        accountNumber,
        password,
        reason: reason.trim(),
      });
      await mutate(next, { revalidate: false });
      setBankCode("");
      setAccountNumber("");
      setResolved(null);
      setReason("");
      setPassword("");
      setSaved(true);
    } catch (caught) {
      setFailure(asApiError(caught));
    } finally {
      setPassword("");
      setBusy(false);
    }
  }

  const general = failure && failure.details.length === 0 ? failure : null;

  return (
    <Section
      title="The NURTW settlement account"
      description="Paystack pays the Union's share of every due into this account. Changing it redirects all of the Union's dues from then on, including money collected and not yet paid out."
    >
      {current ? (
        <dl className="grid gap-1 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-black/55">Bank</dt>
          <dd className="font-medium">{current.bankName}</dd>
          <dt className="text-black/55">Account name</dt>
          <dd className="font-medium">{current.accountName}</dd>
          <dt className="text-black/55">Account number</dt>
          <dd className="font-mono">ending {current.accountNumberLast4}</dd>
          <dt className="text-black/55">Last changed</dt>
          <dd>{moment(current.updatedAt)}</dd>
        </dl>
      ) : (
        <p className="rounded-md border border-[var(--verdict-caution)]/40 bg-[var(--verdict-caution-surface)] px-3 py-2 text-sm">
          <span className="font-semibold">Not set.</span> Dues shared with NURTW
          cannot be paid, and no dedicated account can be opened, until it is.
        </p>
      )}

      {saved ? (
        <p
          role="status"
          className="text-sm font-medium text-[var(--verdict-affirm)]"
        >
          Saved. Paystack now settles the Union&apos;s share to this account.
        </p>
      ) : null}
      {general ? (
        <ErrorNotice message={general.message} requestId={general.requestId} />
      ) : null}
      {bankError instanceof ApiError ? (
        <ErrorNotice
          message="Paystack's list of banks could not be loaded. Try again shortly."
          requestId={bankError.requestId}
        />
      ) : null}

      <h3 className="text-sm font-semibold">
        {current ? "Change the account" : "Add the account"}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Bank"
          htmlFor="settlementBank"
          required
          error={failure?.fieldError("bankCode")}
        >
          <Select
            id="settlementBank"
            value={bankCode}
            onChange={(event) => setBankCode(event.target.value)}
            disabled={banks.length === 0}
          >
            <option value="">
              {banks.length === 0 ? "Loading banks…" : "Choose the bank"}
            </option>
            {banks.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Account number"
          htmlFor="settlementAccountNumber"
          hint="Ten digits."
          required
          error={failure?.fieldError("accountNumber")}
        >
          <TextInput
            id="settlementAccountNumber"
            inputMode="numeric"
            autoComplete="off"
            maxLength={10}
            value={accountNumber}
            onChange={(event) =>
              setAccountNumber(event.target.value.replace(/\D/g, ""))
            }
          />
        </Field>
      </div>
      <div>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !wellFormed}
          onClick={lookUp}
        >
          Look up the account name
        </Button>
      </div>

      {confirmedName ? (
        <>
          <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-3 text-sm">
            <p className="text-black/60">Paystack holds this account as</p>
            <p className="mt-0.5 text-base font-semibold">{confirmedName}</p>
            <p className="mt-1 text-black/60">
              Save only if this is the Union&apos;s own account.
            </p>
          </div>
          <Field
            label="Reason"
            htmlFor="settlementReason"
            required
            error={failure?.fieldError("reason")}
          >
            <TextInput
              id="settlementReason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={1000}
            />
          </Field>
          <Field
            label="Your password"
            htmlFor="settlementPassword"
            hint="Asked again because this change redirects the Union's money."
            required
            error={failure?.fieldError("password")}
          >
            <TextInput
              id="settlementPassword"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <div>
            <Button
              type="button"
              disabled={
                busy || !bank || reason.trim() === "" || password === ""
              }
              onClick={save}
            >
              {current
                ? "Change the settlement account"
                : "Save the settlement account"}
            </Button>
          </div>
        </>
      ) : null}
    </Section>
  );
}

function PercentageSection({
  state,
  mutate,
}: {
  state: SettlementState;
  mutate: KeyedMutator<SettlementState>;
}) {
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);

  const percentage = Number(value);
  const valid =
    value.trim() !== "" &&
    Number.isFinite(percentage) &&
    percentage >= 0 &&
    percentage < 100 &&
    Math.abs(Math.round(percentage * 100) - percentage * 100) < 1e-6;
  const current = state.dedicatedPercentage;
  const shown = valid ? percentage : current;
  const general = failure && failure.details.length === 0 ? failure : null;

  async function save() {
    setBusy(true);
    setFailure(null);
    setSaved(false);
    try {
      await api.put("/payments/settlement/dedicated-percentage", {
        percentage,
        password,
        reason: reason.trim(),
      });
      await mutate(
        { ...state, dedicatedPercentage: percentage },
        { revalidate: true },
      );
      setValue("");
      setReason("");
      setSaved(true);
    } catch (caught) {
      setFailure(asApiError(caught));
    } finally {
      setPassword("");
      setBusy(false);
    }
  }

  return (
    <Section
      title="The dedicated-account percentage"
      description="Money a member sends to their dedicated account is split by Paystack at this fixed percentage: the contractor's account takes this share and pays Paystack's fee out of it, and the rest goes straight to the NURTW settlement account. Payment links are not affected."
    >
      <p className="text-sm">
        {current === null ? (
          <>
            <span className="font-semibold">Not set.</span> No dedicated account
            can be opened until it is.
          </>
        ) : (
          <>
            Currently <span className="font-semibold">{current}%</span>.
          </>
        )}
      </p>
      <p className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-black/70">
        The Union&apos;s rule (PAY-11): Paystack&apos;s dedicated-account fee
        rate, read from the Paystack dashboard, plus 0.5 per cent. Paystack must
        also have enabled dedicated accounts on the business.
      </p>
      {shown !== null ? <Example percentage={shown} /> : null}

      {!state.account ? (
        <p className="text-sm italic text-black/55">
          Add the settlement account first: the percentage is set on it.
        </p>
      ) : (
        <>
          {saved ? (
            <p
              role="status"
              className="text-sm font-medium text-[var(--verdict-affirm)]"
            >
              Saved, at Paystack and here.
            </p>
          ) : null}
          {general ? (
            <ErrorNotice
              message={general.message}
              requestId={general.requestId}
            />
          ) : null}
          <Field
            label="Percentage"
            htmlFor="dedicatedPercentage"
            hint="Up to two decimal places, for example 1.5."
            required
            error={failure?.fieldError("percentage")}
          >
            <TextInput
              id="dedicatedPercentage"
              inputMode="decimal"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </Field>
          <Field
            label="Reason"
            htmlFor="percentageReason"
            required
            error={failure?.fieldError("reason")}
          >
            <TextInput
              id="percentageReason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={1000}
            />
          </Field>
          <Field
            label="Your password"
            htmlFor="percentagePassword"
            required
            error={failure?.fieldError("password")}
          >
            <TextInput
              id="percentagePassword"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <div>
            <Button
              type="button"
              disabled={
                busy || !valid || reason.trim().length < 4 || password === ""
              }
              onClick={save}
            >
              Set the percentage
            </Button>
          </div>
        </>
      )}
    </Section>
  );
}

/** What a ₦1,000 due costs a member at this percentage, worked by the domain rule. */
function Example({ percentage }: { percentage: number }) {
  const due = 100_000;
  const send = amountToSendKobo(due, percentage);
  const credit = dedicatedCreditKobo(send, percentage);
  return (
    <p className="text-sm text-black/70">
      At {percentage}%, to cover a {naira(due)} due a member sends{" "}
      <span className="font-semibold">{naira(send)}</span>. NURTW receives{" "}
      {naira(credit)}, and {naira(send - credit)} goes to the contractor&apos;s
      account, out of which Paystack takes its fee.
    </p>
  );
}

function asApiError(caught: unknown): ApiError {
  return caught instanceof ApiError
    ? caught
    : new ApiError(0, "The service could not be reached.");
}
