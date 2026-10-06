"use client";

import type {
  InternalMembershipVerification,
  InternalVerification,
  MemberDues,
  VehicleDues,
} from "@nurtw/contracts";
import {
  RECOGNISED_NOT_ATTACHED_COPY,
  type DisclosedReason,
  type MembershipNotVerifiedReason,
} from "@nurtw/domain";
import Link from "next/link";
import { useRef, useState, type FormEvent, type ReactNode } from "react";

import { DedicatedAccountSummary } from "@/components/dedicated-account-panel";
import { ExactPaymentLink, day, naira } from "@/components/dues-panel";
import { PersonalPayLink } from "@/components/pay-link";
import { Button, ErrorNotice, StatusChip } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { useSession } from "@/lib/session";

/**
 * The officer verification portal (PRD §11, channels 1 and 2 — items 10 and
 * 24): a vehicle by plate or sticker, and a membership card by its number.
 *
 * Built for a phone at the roadside (DESIGN.md §5): large fields, one button,
 * and a verdict that dominates the screen. DESIGN.md §3 governs the verdict:
 * the word VERIFIED or NOT VERIFIED, a shape (a circle with a tick, an octagon
 * with a cross), and only then colour. Read in greyscale, it still says which.
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

const MEMBER_STATUS_WORDS: Record<string, string> = {
  PENDING: "awaiting approval",
  SUSPENDED: "suspended",
  CANCELLED: "cancelled",
};

const CARD_STATUS_WORDS: Record<string, string> = {
  DRAFT: "not yet issued",
  PENDING_APPROVAL: "not yet issued",
  ISSUED: "issued but not yet handed over",
  SUSPENDED: "suspended",
  LOST: "reported lost",
  REPLACED: "replaced by a newer card",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
};

/** Each vehicle reason in plain words, with the detail the result carries. */
function explain(reason: DisclosedReason, fields: Fields): string {
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
        return `The register records this sticker for ${fields.registered_plate}, not this plate.`;
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
    case "RECORD_INCOMPLETE":
      // VEH-28 — what an officer without vehicle.declare is told in place of
      // the declaration status. It never says "declared".
      return "This vehicle's record is not complete. Refer the member to their unit or branch office.";
    case "NOT_ONBOARDED":
      return "The vehicle has not been onboarded: no sticker has been attached to it.";
  }
}

/** Each membership reason in plain words. */
function explainMembership(
  reason: MembershipNotVerifiedReason,
  fields: Fields,
): string {
  switch (reason) {
    case "NO_RECORD":
      return "No NURTW card or membership answers to this number.";
    case "MEMBER_NOT_ACTIVE":
      return `The membership is ${
        MEMBER_STATUS_WORDS[fields.membership_status ?? ""] ?? "not active"
      }.`;
    case "CARD_NOT_ACTIVE":
      return `This card is ${
        CARD_STATUS_WORDS[fields.card_status ?? ""] ?? "not active"
      }.`;
    case "CARD_EXPIRED":
      return fields.card_expiry_date
        ? `This card expired on ${day(fields.card_expiry_date)}.`
        : "This card has expired.";
  }
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Lagos",
  });
}

function VerdictPanel({
  matched,
  statement,
  lines,
}: {
  matched: boolean;
  statement: string;
  lines: string[];
}) {
  return (
    <div
      role="status"
      className={
        "rounded-xl px-5 py-6 text-on-solid sm:px-8 " +
        (matched ? "bg-verdict-affirm-solid" : "bg-verdict-deny-solid")
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
      <p className="mt-4 text-base font-medium">{statement}</p>
      {lines.length > 0 ? (
        <ul className="mt-4 grid gap-2 border-t border-on-solid/30 pt-4 text-base">
          {lines.map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden>•</span>
              <span>{line}</span>
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
      <dt className="text-xs font-medium uppercase tracking-wide text-faint-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-base">{children}</dd>
    </div>
  );
}

function VehicleFacts({ fields }: { fields: Fields }) {
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

  return (
    <section className="rounded-lg border border-line bg-surface p-5">
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
        {fields.plate_number ? (
          <Fact label="Onboarded">
            {fields.onboarded_at ? day(fields.onboarded_at) : "Not onboarded"}
          </Fact>
        ) : null}
        {fields.sticker_status ? (
          <Fact label="Sticker">
            <span className="flex flex-wrap items-center gap-2">
              <StatusChip status={fields.sticker_status} />
              {fields.attached_at ? (
                <span className="text-sm text-muted-foreground">
                  attached {day(fields.attached_at)}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">
                  not attached
                </span>
              )}
            </span>
          </Fact>
        ) : null}
        {fields.sticker_plate ? (
          <Fact label="Sticker is on">{fields.sticker_plate}</Fact>
        ) : null}
        {fields.registered_plate && !fields.attached_at ? (
          <Fact label="Sticker register">
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

function MembershipFacts({ fields }: { fields: Fields }) {
  if (Object.keys(fields).length === 0) {
    return null;
  }
  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <h2 className="text-base font-semibold">What the System holds</h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        {fields.member_name ? (
          <Fact label="Name">
            <span className="font-semibold">{fields.member_name}</span>
            {/* The name is shown so a genuine number on someone else's card
                is caught. */}
            <span className="mt-0.5 block text-sm text-muted-foreground">
              Check this against the name on the card.
            </span>
          </Fact>
        ) : null}
        {fields.membership_number ? (
          <Fact label="Membership number">
            <span className="font-mono">{fields.membership_number}</span>
          </Fact>
        ) : null}
        {fields.membership_status ? (
          <Fact label="Membership">
            <StatusChip status={fields.membership_status} />
          </Fact>
        ) : null}
        {fields.card_number ? (
          <Fact label="Card">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{fields.card_number}</span>
              {fields.card_status ? (
                <StatusChip status={fields.card_status} />
              ) : null}
            </span>
          </Fact>
        ) : null}
        {fields.card_number ? (
          <Fact label="Expires">
            {fields.card_expiry_date
              ? day(fields.card_expiry_date)
              : "No expiry date"}
          </Fact>
        ) : null}
        {fields.designation ? (
          <Fact label="Designation">{fields.designation}</Fact>
        ) : null}
        {fields.organizational_unit ? (
          <Fact label="Branch or unit">{fields.organizational_unit}</Fact>
        ) : null}
      </dl>
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
function Dues({
  vehicle,
  member,
}: {
  vehicle: VehicleDues | null;
  member: MemberDues | null;
}) {
  if (!vehicle && !member) {
    return null;
  }
  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <h2 className="text-base font-semibold">Dues</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Shown to NURTW staff only. Dues never change the verification result.
      </p>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        {vehicle ? (
          <Fact label="Monthly levy">
            <span className="flex flex-wrap items-center gap-2">
              <StatusChip status={vehicle.status} />
              <span className="text-sm">{levySentence(vehicle)}</span>
            </span>
          </Fact>
        ) : null}
        {member ? (
          <Fact label="Membership fee">
            <span className="flex flex-wrap items-center gap-2">
              <StatusChip status={member.status} />
              <span className="text-sm">{membershipSentence(member)}</span>
            </span>
          </Fact>
        ) : null}
      </dl>
      <PayNow vehicle={vehicle} member={member} />
    </section>
  );
}

/**
 * Paying from a check (PRD Requirement 27.8, revision 1.9; PAY-21 — item 31).
 *
 * One button, for an officer who may start payments, opening every way to pay
 * what the check has just shown: a Paystack link for the exact amount, the
 * personal pay link to send to the payer's phone, and the member's dedicated
 * account. These call the payments routes; the check itself stays read-only.
 */
function PayNow({
  vehicle,
  member,
}: {
  vehicle: VehicleDues | null;
  member: MemberDues | null;
}) {
  const { holds } = useSession();
  const [open, setOpen] = useState(false);

  if (!holds("payment.initiate")) {
    return null;
  }
  if (!open) {
    return (
      <div className="mt-4">
        <Button type="button" onClick={() => setOpen(true)}>
          Pay now
        </Button>
      </div>
    );
  }
  return (
    <div className="mt-4 grid gap-5">
      {vehicle ? (
        <div className="grid gap-3 rounded-md border border-line p-4">
          <h3 className="text-sm font-semibold">
            Monthly levy · one month is {naira(vehicle.currentAmountKobo)}
          </h3>
          <ExactPaymentLink
            feeTypeCode="LEVY"
            subjectType="vehicle"
            subjectId={vehicle.vehicleId}
          />
          <PersonalPayLink
            subjectType="vehicle"
            subjectId={vehicle.vehicleId}
          />
        </div>
      ) : null}
      {member ? (
        <div className="grid gap-3 rounded-md border border-line p-4">
          <h3 className="text-sm font-semibold">
            Membership fee · one year is {naira(member.currentAmountKobo)}
          </h3>
          <ExactPaymentLink
            feeTypeCode="MEMBERSHIP"
            subjectType="member"
            subjectId={member.memberId}
          />
          <PersonalPayLink subjectType="member" subjectId={member.memberId} />
          <DedicatedAccountSummary memberId={member.memberId} />
        </div>
      ) : null}
      <p className="text-xs text-faint-foreground">
        A payment shows here once Paystack confirms it. Check again to see it.
      </p>
    </div>
  );
}

/** The API's errors are generic (Requirement 14.3), so the screen explains them. */
function explainError(error: ApiError, what: "vehicles" | "cards"): ApiError {
  const message: Record<number, string> = {
    403: `Your account cannot verify ${what}. Ask an administrator for the verification permission.`,
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

const inputClass =
  "w-full rounded-lg border border-line bg-surface px-4 py-3 text-lg " +
  "outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25";

function FieldError({ message }: { message: string | undefined }) {
  return message ? (
    <p role="alert" className="text-sm font-medium text-verdict-deny">
      {message}
    </p>
  ) : null;
}

function Reference({ reference, at }: { reference: string; at: string }) {
  return (
    <p className="font-mono text-xs text-faint-foreground">
      Reference {reference} · checked at {time(at)}
    </p>
  );
}

/** Puts the keyboard away so the verdict is what the officer sees. */
function dismissKeyboard() {
  (document.activeElement as HTMLElement | null)?.blur();
}

function showResult(region: HTMLDivElement | null) {
  requestAnimationFrame(() =>
    region?.scrollIntoView({ behavior: "smooth", block: "start" }),
  );
}

function VehicleCheck() {
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
    dismissKeyboard();
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
      showResult(resultRegion.current);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(explainError(caught, "vehicles"));
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

  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">
        Enter the plate, the sticker&apos;s code, or both. Both together also
        check that the sticker belongs to the plate.
      </p>

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
          <FieldError message={error?.fieldError("plateNumber")} />
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="code" className="text-sm font-medium">
            Sticker code
          </label>
          <p className="text-xs text-faint-foreground">
            Scan the sticker&apos;s code into this box, or type the number on the
            sticker.
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
          <FieldError message={error?.fieldError("stickerCode")} />
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
            <VerdictPanel
              matched={result.matched}
              statement={result.statement}
              lines={result.reasons.map((reason) =>
                explain(reason, result.fields),
              )}
            />
            <Reference reference={result.reference} at={result.verifiedAt} />
            <VehicleFacts fields={result.fields} />
            <Dues vehicle={result.dues.vehicle} member={result.dues.member} />
            <p className="text-xs text-faint-foreground">{result.limitation}</p>
          </>
        ) : null}
      </div>
    </div>
  );
}

function MembershipCheck() {
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<InternalMembershipVerification | null>(
    null,
  );
  const numberInput = useRef<HTMLInputElement>(null);
  const resultRegion = useRef<HTMLDivElement>(null);

  const canSubmit = number.trim() !== "" && !busy;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    dismissKeyboard();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await api.post<{
        verification: InternalMembershipVerification;
      }>("/verifications/membership", { number: number.trim() });
      setResult(response.verification);
      showResult(resultRegion.current);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(explainError(caught, "cards"));
      }
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setNumber("");
    setResult(null);
    setError(null);
    numberInput.current?.focus();
  }

  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">
        Enter the card number or the membership number printed on the card.
      </p>

      <form onSubmit={submit} className="grid gap-4" noValidate>
        <div className="grid gap-1.5">
          <label htmlFor="number" className="text-sm font-medium">
            Card or membership number
          </label>
          <input
            id="number"
            ref={numberInput}
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={32}
            placeholder="e.g. 7K3Q-WX9P-2MND-4"
            className={`${inputClass} font-mono uppercase tracking-wide`}
          />
          <FieldError message={error?.fieldError("number")} />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="submit"
            disabled={!canSubmit}
            className="h-14 flex-1 text-lg"
          >
            {busy ? "Checking…" : "Verify"}
          </Button>
          {number || result ? (
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
            <VerdictPanel
              matched={result.matched}
              statement={result.statement}
              lines={result.reasons.map((reason) =>
                explainMembership(reason, result.fields),
              )}
            />
            <Reference reference={result.reference} at={result.verifiedAt} />
            <MembershipFacts fields={result.fields} />
            <Dues vehicle={null} member={result.dues.member} />
            <p className="text-xs text-faint-foreground">{result.limitation}</p>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function VerifyPage() {
  const { holds } = useSession();
  const canCheckVehicles = holds("verification.perform");
  const canCheckCards = holds("verification.membership");
  const [mode, setMode] = useState<"vehicle" | "card">(
    canCheckVehicles ? "vehicle" : "card",
  );

  const tabs = [
    { key: "vehicle" as const, label: "Vehicle", allowed: canCheckVehicles },
    { key: "card" as const, label: "Membership card", allowed: canCheckCards },
  ].filter((tab) => tab.allowed);

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <h1 className="text-xl font-semibold tracking-tight">Verify</h1>

      {tabs.length > 1 ? (
        <div
          role="tablist"
          aria-label="What to verify"
          className="grid grid-cols-2 gap-2 rounded-lg bg-surface-muted p-1"
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={mode === tab.key}
              onClick={() => setMode(tab.key)}
              className={
                "h-12 rounded-md text-base font-semibold transition " +
                (mode === tab.key
                  ? "bg-surface text-brand-text shadow-sm"
                  : "text-muted-foreground hover:text-muted-foreground")
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      {tabs.length === 0 ? (
        <ErrorNotice message="Your account cannot verify vehicles or cards. Ask an administrator for the verification permission." />
      ) : mode === "vehicle" && canCheckVehicles ? (
        <VehicleCheck />
      ) : (
        <MembershipCheck />
      )}
    </div>
  );
}
