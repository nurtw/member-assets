"use client";

import type {
  InternalVerification,
  MemberDues,
  VehicleDues,
} from "@nurtw/contracts";
import {
  RECOGNISED_NOT_ATTACHED_COPY,
  type NotVerifiedReason,
} from "@nurtw/domain";
import Link from "next/link";
import { useRef, useState, type FormEvent, type ReactNode } from "react";

import { day, naira } from "@/components/dues-panel";
import { Button, ErrorNotice, StatusChip } from "@/components/ui";
import { ApiError, api } from "@/lib/api";

/**
 * The officer verification portal (PRD §11, channels 1 and 2 — item 10).
 *
 * Built for a phone at the roadside (DESIGN.md §5): two large fields, one
 * button, and a verdict that dominates the screen. DESIGN.md §3 governs the
 * verdict: the word VERIFIED or NOT VERIFIED, a shape (a circle with a tick, an
 * octagon with a cross), and only then colour. Read in greyscale, it still says
 * which.
 *
 * Everything shown comes from the API's projection. The page holds no rule of
 * its own about what an officer may see; it explains what it is given.
 */

type Fields = InternalVerification["fields"];

const STICKER_STATUS_WORDS: Record<string, string> = {
  DRAFT: "not yet in use",
  ISSUED: "not yet in use",
  SUSPENDED: "suspended",
  LOST: "reported lost",
  REPLACED: "replaced by another sticker",
  DAMAGED: "reported damaged",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
};

const DECLARATION_SENTENCES: Record<string, string> = {
  ON_RECORD: "The vehicle is on record only. It has not been declared.",
  PENDING: "The vehicle's declaration is pending.",
  SUSPENDED: "The vehicle's declaration is suspended.",
  DISPUTED: "The vehicle's declaration is disputed.",
  RETIRED: "The vehicle's record is retired.",
  ARCHIVED: "The vehicle's record is archived.",
};

/** Each reason in plain words, with the detail the result carries. */
function explain(reason: NotVerifiedReason, fields: Fields): string {
  switch (reason) {
    case "INVALID_CODE":
      return "This is not a valid NURTW sticker code. It may be forged, or it may have been misread. Check it again, or check the plate on its own.";
    case "NO_RECORD":
      return "No NURTW record answers to what was entered.";
    case "PLATE_MISMATCH":
      if (fields.sticker_plate) {
        return `This sticker belongs to another vehicle: ${fields.sticker_plate}.`;
      }
      if (fields.registered_plate) {
        return `The Transpay register records this sticker for ${fields.registered_plate}, not this plate.`;
      }
      return "This sticker does not belong to this plate.";
    case "STICKER_NOT_ATTACHED":
      // PRD Requirement 11.2: the exact wording, then the registered plate.
      // Never "genuine": a copy of a real sticker scans the same.
      return fields.identifier_scheme === "LEGACY"
        ? `${RECOGNISED_NOT_ATTACHED_COPY}${
            fields.registered_plate
              ? `. Registered to ${fields.registered_plate}`
              : ""
          }. It must be reattached before it verifies.`
        : "This sticker has not been attached to any vehicle.";
    case "STICKER_NOT_ACTIVE":
      return `The sticker is ${
        STICKER_STATUS_WORDS[fields.sticker_status ?? ""] ?? "not active"
      }.`;
    case "NOT_DECLARED":
      return (
        DECLARATION_SENTENCES[fields.declaration_status ?? ""] ??
        "The vehicle is not declared."
      );
    case "NOT_ONBOARDED":
      return "The vehicle has not been onboarded: no sticker has been attached to it.";
  }
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Lagos",
  });
}

function VerdictPanel({ result }: { result: InternalVerification }) {
  const matched = result.matched;
  return (
    <div
      role="status"
      className={
        "rounded-xl px-5 py-6 text-white sm:px-8 " +
        (matched ? "bg-[var(--verdict-affirm)]" : "bg-[var(--verdict-deny)]")
      }
    >
      <div className="flex items-center gap-4">
        {matched ? (
          // A circle with a tick.
          <svg viewBox="0 0 48 48" className="h-14 w-14 shrink-0" aria-hidden>
            <circle
              cx="24"
              cy="24"
              r="21"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              d="M14 25l7 7 13-15"
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          // An octagon with a cross: a different outline, not only a different colour.
          <svg viewBox="0 0 48 48" className="h-14 w-14 shrink-0" aria-hidden>
            <path
              d="M16 3h16l13 13v16L32 45H16L3 32V16z"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinejoin="round"
            />
            <path
              d="M17 17l14 14M31 17L17 31"
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </svg>
        )}
        <p className="text-3xl font-black tracking-wide sm:text-4xl">
          {matched ? "VERIFIED" : "NOT VERIFIED"}
        </p>
      </div>
      <p className="mt-4 text-base font-medium">{result.statement}</p>
      {result.reasons.length > 0 ? (
        <ul className="mt-4 grid gap-2 border-t border-white/30 pt-4 text-base">
          {result.reasons.map((reason) => (
            <li key={reason} className="flex gap-2">
              <span aria-hidden>•</span>
              <span>{explain(reason, result.fields)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-black/45">
        {label}
      </dt>
      <dd className="mt-0.5 text-base">{children}</dd>
    </div>
  );
}

function Facts({ fields }: { fields: Fields }) {
  if (Object.keys(fields).length === 0) {
    return null;
  }
  const vehicleWords = [
    fields.vehicle_category,
    fields.make,
    fields.model,
    fields.color,
  ]
    .filter(Boolean)
    .join(" · ");
  const isLegacy = fields.identifier_scheme === "LEGACY";

  return (
    <section className="rounded-lg border border-[var(--border-subtle)] bg-white p-5">
      <h2 className="text-base font-semibold">What the System holds</h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        {fields.plate_number ? (
          <Fact label="Plate">{fields.plate_number}</Fact>
        ) : null}
        {vehicleWords ? <Fact label="Vehicle">{vehicleWords}</Fact> : null}
        {fields.route_type ? (
          <Fact label="Route type">{fields.route_type}</Fact>
        ) : null}
        {fields.organizational_unit ? (
          <Fact label="Branch or unit">{fields.organizational_unit}</Fact>
        ) : null}
        {fields.declaration_status ? (
          <Fact label="Declaration">
            <StatusChip status={fields.declaration_status} />
          </Fact>
        ) : null}
        {fields.declaration_status ? (
          <Fact label="Onboarded">
            {fields.onboarded_at ? day(fields.onboarded_at) : "Not onboarded"}
          </Fact>
        ) : null}
        {fields.sticker_status ? (
          <Fact label={isLegacy ? "Transpay sticker" : "NURTW sticker"}>
            <span className="flex flex-wrap items-center gap-2">
              <StatusChip status={fields.sticker_status} />
              {fields.attached_at ? (
                <span className="text-sm text-black/60">
                  attached {day(fields.attached_at)}
                </span>
              ) : (
                <span className="text-sm text-black/60">not attached</span>
              )}
            </span>
          </Fact>
        ) : null}
        {fields.sticker_plate ? (
          <Fact label="Sticker is on">{fields.sticker_plate}</Fact>
        ) : null}
        {fields.registered_plate && !fields.attached_at ? (
          <Fact label="Transpay register">
            {RECOGNISED_NOT_ATTACHED_COPY}. Registered to{" "}
            {fields.registered_plate}.
          </Fact>
        ) : null}
        {fields.member_name ? (
          <Fact label="Member">
            {fields.member_name}
            {fields.membership_number ? ` · ${fields.membership_number}` : ""}
            {fields.member_status ? (
              <span className="ml-2 inline-block align-middle">
                <StatusChip status={fields.member_status} />
              </span>
            ) : null}
          </Fact>
        ) : null}
      </dl>
      {fields.vehicle_id ? (
        <p className="mt-4">
          <Link
            href={`/vehicles/${fields.vehicle_id}`}
            className="text-sm font-semibold underline underline-offset-2"
          >
            Open the vehicle&apos;s record
          </Link>
        </p>
      ) : null}
    </section>
  );
}

function levySentence(dues: VehicleDues): string {
  const months = dues.unpaidMonths.length;
  switch (dues.status) {
    case "PAID":
      return dues.nextDueOn
        ? `Paid up. The next month falls due on ${day(dues.nextDueOn)}.`
        : "Paid up.";
    case "OWED":
      return `${naira(dues.outstandingKobo)} owed for this month.`;
    case "IN_ARREARS":
      return `${naira(dues.outstandingKobo)} owed across ${months} month${months === 1 ? "" : "s"}.`;
    case "NOT_DUE":
      return dues.firstDueOn
        ? `Nothing due yet. The levy starts on ${day(dues.firstDueOn)}.`
        : "Nothing due: the vehicle has not been onboarded.";
  }
}

function membershipSentence(dues: MemberDues): string {
  switch (dues.status) {
    case "PAID":
      return dues.coveredUntil
        ? `Paid until ${day(dues.coveredUntil)}.`
        : "Paid up.";
    case "OWED":
      return `${naira(dues.outstandingKobo)} owed${
        dues.owedSince ? ` since ${day(dues.owedSince)}` : ""
      }.`;
    case "IN_ARREARS":
      return `${naira(dues.outstandingKobo)} owed.`;
    case "NOT_DUE":
      return dues.notStartedBecause === "NOT_APPROVED"
        ? "Not due: the member has not been approved."
        : dues.notStartedBecause === "NO_GO_LIVE_DATE"
          ? "Not due yet: the go-live date has not been set."
          : "Nothing due yet.";
  }
}

/**
 * Dues, beside the verdict and never part of it (PRD Requirement 27.8,
 * PAY-05). The API includes them only within the officer's read scope.
 */
function Dues({ dues }: { dues: InternalVerification["dues"] }) {
  if (!dues.vehicle && !dues.member) {
    return null;
  }
  return (
    <section className="rounded-lg border border-[var(--border-subtle)] bg-white p-5">
      <h2 className="text-base font-semibold">Dues</h2>
      <p className="mt-1 text-sm text-black/60">
        Shown to NURTW staff only. Dues never change the verification result.
      </p>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        {dues.vehicle ? (
          <Fact label="Monthly levy">
            <span className="flex flex-wrap items-center gap-2">
              <StatusChip status={dues.vehicle.status} />
              <span className="text-sm">{levySentence(dues.vehicle)}</span>
            </span>
          </Fact>
        ) : null}
        {dues.member ? (
          <Fact label="Membership fee">
            <span className="flex flex-wrap items-center gap-2">
              <StatusChip status={dues.member.status} />
              <span className="text-sm">{membershipSentence(dues.member)}</span>
            </span>
          </Fact>
        ) : null}
      </dl>
    </section>
  );
}

/** The API's errors are generic (Requirement 14.3), so the screen explains them. */
function explainError(error: ApiError): ApiError {
  const message: Record<number, string> = {
    403: "Your account cannot verify vehicles. Ask an administrator for the verification permission.",
    503: "Signed NURTW stickers cannot be checked yet, because the System's signing key is not configured. Check the plate on its own, and tell an administrator.",
  };
  return message[error.status]
    ? new ApiError(
        error.status,
        message[error.status]!,
        error.requestId,
        error.details,
      )
    : error;
}

export default function VerifyPage() {
  const [plate, setPlate] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<InternalVerification | null>(null);
  const plateInput = useRef<HTMLInputElement>(null);
  const resultRegion = useRef<HTMLDivElement>(null);

  const canSubmit = (plate.trim() !== "" || code.trim() !== "") && !busy;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    // Put the keyboard away so the verdict is what the officer sees.
    (document.activeElement as HTMLElement | null)?.blur();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const body: { plateNumber?: string; stickerCode?: string } = {};
      if (plate.trim()) body.plateNumber = plate.trim();
      if (code.trim()) body.stickerCode = code.trim();
      const response = await api.post<{ verification: InternalVerification }>(
        "/verifications",
        body,
      );
      setResult(response.verification);
      requestAnimationFrame(() =>
        resultRegion.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      );
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(explainError(caught));
      }
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setPlate("");
    setCode("");
    setResult(null);
    setError(null);
    plateInput.current?.focus();
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--border-subtle)] bg-white px-4 py-3 text-lg " +
    "outline-none transition focus:border-[var(--nurtw-green)] focus:ring-2 focus:ring-[var(--nurtw-green)]/25";

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Verify a vehicle
        </h1>
        <p className="mt-1 text-sm text-black/60">
          Enter the plate, the sticker&apos;s code, or both. Both together also
          check that the sticker belongs to the plate.
        </p>
      </div>

      <form onSubmit={submit} className="grid gap-4" noValidate>
        <div className="grid gap-1.5">
          <label htmlFor="plate" className="text-sm font-medium">
            Plate number
          </label>
          <input
            id="plate"
            ref={plateInput}
            value={plate}
            onChange={(event) => setPlate(event.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={20}
            placeholder="e.g. AWK 123 XY"
            className={`${inputClass} font-semibold uppercase tracking-wide`}
          />
          {error?.fieldError("plateNumber") ? (
            <p
              role="alert"
              className="text-sm font-medium text-[var(--verdict-deny)]"
            >
              {error.fieldError("plateNumber")}
            </p>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="code" className="text-sm font-medium">
            Sticker code
          </label>
          <p className="text-xs text-black/55">
            Scan the sticker&apos;s code into this box, or type the number on a
            Transpay sticker.
          </p>
          <input
            id="code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={128}
            className={`${inputClass} font-mono`}
          />
          {error?.fieldError("stickerCode") ? (
            <p
              role="alert"
              className="text-sm font-medium text-[var(--verdict-deny)]"
            >
              {error.fieldError("stickerCode")}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="submit"
            disabled={!canSubmit}
            className="h-14 flex-1 text-lg"
          >
            {busy ? "Checking…" : "Verify"}
          </Button>
          {plate || code || result ? (
            <Button
              type="button"
              variant="secondary"
              onClick={reset}
              className="h-14 text-base"
            >
              Check another
            </Button>
          ) : null}
        </div>
      </form>

      {error && error.details.length === 0 ? (
        <ErrorNotice message={error.message} requestId={error.requestId} />
      ) : null}

      <div
        ref={resultRegion}
        aria-live="polite"
        className="grid scroll-mt-4 gap-4"
      >
        {result ? (
          <>
            <VerdictPanel result={result} />
            <p className="font-mono text-xs text-black/55">
              Reference {result.reference} · checked at{" "}
              {time(result.verifiedAt)}
            </p>
            <Facts fields={result.fields} />
            <Dues dues={result.dues} />
            <p className="text-xs text-black/55">{result.limitation}</p>
          </>
        ) : null}
      </div>
    </div>
  );
}
