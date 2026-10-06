"use client";

import type {
  CheckPaymentsResult,
  MasterDataEntry,
  OnboardingState,
  StickerReading,
  VehicleDetail,
} from "@nurtw/contracts";
import {
  NEW_STICKERS_IN_USE,
  ONBOARDING_FEE_TYPE_CODES,
  stickerCanBeGiven,
  stickerCodeScheme,
  stickerOffer,
} from "@nurtw/domain";
import { Check, CreditCard, Sticker } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import useSWR from "swr";

import { ScanButton, StickerScanDialog } from "@/components/qr-scanner";
import { onboardingKey } from "@/components/sticker-prompt";
import {
  Button,
  Detail,
  DetailList,
  ErrorNotice,
  Field,
  Loading,
  Notice,
  Section,
  Select,
  TextInput,
} from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";

/**
 * Assigning a sticker to a vehicle (PRD §9A, items 17 and 27): pay, then scan.
 *
 * The order is the owner's direction of 5 October 2026 (`QUESTIONS.md`
 * VEH-31). The fee is paid first, or a payment already confirmed for this
 * vehicle is found. Only then does the camera open, to read the number from
 * the sticker's own QR code. The officer confirms, and the sticker is
 * attached.
 *
 * The API refuses a bad attachment with a generic 409 and keeps the reason in
 * the audit trail (Requirement 14.3), so this screen asks first: once a
 * sticker is scanned it reads what that sticker can be for this vehicle, and
 * offers to attach it only when it can be.
 */

/** Which sticker the vehicle is being given, which decides the fee. */
type Source = "OWN" | "STOCK";

const FEE_FOR: Record<Source, string> = {
  // The sticker the vehicle already carries, recorded for its plate.
  OWN: ONBOARDING_FEE_TYPE_CODES.reattachment,
  // One the vehicle did not have.
  STOCK: ONBOARDING_FEE_TYPE_CODES.newSticker,
};

/** A scanned sticker, and what the System says it can be for this vehicle. */
type Read =
  | { kind: "LEGACY"; code: string; reading: StickerReading }
  | { kind: "SIGNED"; code: string; stickerQrId: string };

function naira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

function day(value: string): string {
  return new Date(value).toLocaleDateString("en-GB");
}

function unreachable(caught: unknown): ApiError {
  return caught instanceof ApiError
    ? caught
    : new ApiError(0, "The service could not be reached.");
}

/** Why a scanned sticker cannot be attached, in words (DESIGN.md §3). */
function cannotAttach(
  read: Read,
  feeCode: string,
): { title: string; text: string } | null {
  if (read.kind === "SIGNED") {
    return NEW_STICKERS_IN_USE
      ? null
      : {
          title: "This kind of sticker is not in use yet",
          text: "Scan one of the stickers in stock, or the sticker the vehicle carries.",
        };
  }
  const { reading } = read;
  switch (reading.result) {
    case "NOT_HELD":
      return {
        title: "This sticker is not on record",
        text: "It is not in stock, and it is not recorded for any vehicle. A sticker must be added to stock before it can be assigned.",
      };
    case "FOR_ANOTHER_VEHICLE":
      return {
        title: "This sticker belongs to another vehicle",
        text: "It is recorded for a different plate, and cannot be assigned to this one. There is no override.",
      };
    case "ALREADY_ATTACHED":
      return {
        title: "This sticker is already on a vehicle",
        text: "A sticker is assigned once in its life. Scan another.",
      };
    case "NOT_AVAILABLE":
      return {
        title: "This sticker was withdrawn",
        text: "It can no longer be assigned. Scan another.",
      };
    case "CAN_ATTACH":
      if (reading.feeTypeCode === feeCode) {
        return null;
      }
      return reading.feeTypeCode === FEE_FOR.OWN
        ? {
            title: "This is the vehicle's own sticker",
            text: "The payment on record is for a sticker from stock. Choose the vehicle's own sticker above and pay the reattachment fee, or scan a sticker from stock.",
          }
        : {
            title: "This sticker is from stock",
            text: "The payment on record is for reattaching the vehicle's own sticker. Scan the sticker the vehicle carries, or choose a sticker from stock above and pay that fee.",
          };
  }
}

function Step({
  number,
  title,
  done = false,
  locked = false,
  children,
}: {
  number: number;
  title: string;
  done?: boolean;
  locked?: boolean;
  children?: ReactNode;
}) {
  return (
    <li className="grid grid-cols-[auto_1fr] gap-x-3">
      <span
        aria-hidden
        className={cn(
          "flex size-7 items-center justify-center rounded-full border text-xs font-semibold",
          done
            ? "border-verdict-affirm bg-verdict-affirm-surface text-verdict-affirm"
            : locked
              ? "border-line text-faint-foreground"
              : "border-primary bg-primary text-on-solid",
        )}
      >
        {done ? <Check className="size-4" /> : number}
      </span>
      <div className="grid min-w-0 gap-3 pb-6">
        <h3
          className={cn(
            "text-sm font-semibold leading-7",
            locked && "text-faint-foreground",
          )}
        >
          <span className="sr-only">Step {number}: </span>
          {title}
          {done ? <span className="sr-only"> (done)</span> : null}
        </h3>
        {children}
      </div>
    </li>
  );
}

export function OnboardingSection({
  vehicle,
  onChanged,
}: {
  vehicle: VehicleDetail;
  onChanged: () => Promise<unknown>;
}) {
  const { holds } = useSession();
  const searchParams = useSearchParams();
  const [chosenSource, setChosenSource] = useState<Source | null>(null);
  const [payerEmail, setPayerEmail] = useState("");
  const [started, setStarted] = useState<{
    url: string;
    qr: string;
    totalChargedKobo: number;
  } | null>(null);
  const [waiting, setWaiting] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [read, setRead] = useState<Read | null>(null);
  const [routeTypeId, setRouteTypeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const { data, mutate } = useSWR<{ onboarding: OnboardingState }>(
    onboardingKey(vehicle.id),
    fetcher,
  );
  const state = data?.onboarding ?? null;

  const needsRouteType = state !== null && !state.hasRouteType;
  const { data: routeTypeList } = useSWR<{ entries: MasterDataEntry[] }>(
    needsRouteType && holds("vehicle.update")
      ? "/master-data/route-types"
      : null,
    fetcher,
  );

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(unreachable(caught));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Asks Paystack about this vehicle's open payments, so a payer who has just
   * paid is not kept waiting on the webhook. Nothing is confirmed on this
   * screen's word: the API verifies each payment with Paystack.
   */
  async function checkPayment(feeCode: string) {
    await run(async () => {
      setWaiting(null);
      await api.post<CheckPaymentsResult>("/payments/check", {
        subjectType: "vehicle",
        subjectId: vehicle.id,
      });
      const fresh = await mutate();
      const paid = fresh?.onboarding.eligiblePayments.some(
        (payment) => payment.feeTypeCode === feeCode,
      );
      if (paid) {
        setStarted(null);
        // The payment is confirmed: straight to the sticker.
        setScanning(true);
      } else {
        setWaiting(
          "No confirmed payment yet. If the payer has just paid, give it a few seconds and check again.",
        );
      }
    });
  }

  // Back from Paystack's page, which adds the payment's reference to the
  // address: check at once, whichever fee was paid. Once per visit.
  const returnedFromPaying =
    searchParams.has("reference") || searchParams.has("trxref");
  const checkedReturn = useRef(false);
  useEffect(() => {
    if (!returnedFromPaying || checkedReturn.current) {
      return;
    }
    checkedReturn.current = true;
    void (async () => {
      try {
        await api.post<CheckPaymentsResult>("/payments/check", {
          subjectType: "vehicle",
          subjectId: vehicle.id,
        });
        const fresh = await mutate();
        if ((fresh?.onboarding.eligiblePayments.length ?? 0) > 0) {
          setScanning(true);
        } else {
          setWaiting(
            "The payment is not confirmed yet. Give it a few seconds, then check again.",
          );
        }
      } catch (caught) {
        setError(unreachable(caught));
      }
    })();
  }, [returnedFromPaying, vehicle.id, mutate]);

  if (!state) {
    return (
      <Section title="Assign a sticker">
        <Loading rows={2} />
      </Section>
    );
  }

  if (state.attachment) {
    const { attachment } = state;
    return (
      <Section title="Sticker">
        <Notice tone="affirm" title="Sticker assigned" icon={Sticker}>
          Assigned on {day(attachment.attachedAt)}
          {attachment.attachedBy ? ` by ${attachment.attachedBy}` : ""}.
        </Notice>
        <DetailList>
          <Detail label="Sticker number">
            <span className="font-mono">{attachment.stickerNumber}</span>
          </Detail>
          <Detail
            label="Sticker status"
            value={attachment.stickerStatus.replace(/_/g, " ")}
          />
        </DetailList>
      </Section>
    );
  }

  if (needsRouteType) {
    return (
      <Section
        title="Assign a sticker"
        description="The vehicle needs a route type first."
      >
        {error ? (
          <ErrorNotice message={error.message} requestId={error.requestId} />
        ) : null}
        <p className="text-sm">
          The monthly levy starts after a sticker is assigned and is priced by
          route type, so a vehicle without one cannot be given a sticker.
        </p>
        {holds("vehicle.update") ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <Field label="Route type" htmlFor="onboardRouteType" required>
                <Select
                  id="onboardRouteType"
                  value={routeTypeId}
                  onChange={(event) => setRouteTypeId(event.target.value)}
                >
                  <option value="">Select a route type</option>
                  {(routeTypeList?.entries ?? []).map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !routeTypeId}
              onClick={() =>
                void run(async () => {
                  await api.patch(`/vehicles/${vehicle.id}`, { routeTypeId });
                  await Promise.all([mutate(), onChanged()]);
                })
              }
            >
              Save route type
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Ask an officer who can amend vehicles to set one.
          </p>
        )}
      </Section>
    );
  }

  const offer = stickerOffer({
    attached: false,
    registerHoldsBarcodeForPlate: state.registerHoldsBarcodeForPlate,
    stockHasStickers: state.stockHasStickers,
    newStickersInUse: NEW_STICKERS_IN_USE,
  });
  // A payment already confirmed counts whatever stock holds now: it was taken
  // for a sticker, and the sticker is owed.
  const confirmed = state.eligiblePayments;

  if (!stickerCanBeGiven(offer) && confirmed.length === 0) {
    return (
      <Section title="Assign a sticker">
        <Notice tone="info" title="No sticker to give yet" icon={Sticker}>
          <p>
            No sticker is recorded for this plate, and stock holds none.
            Stickers are added to stock by scanning them. Nothing is charged
            until there is one to give.
          </p>
          {holds("sticker.stock_intake") ? (
            <p className="mt-2">
              <Link
                href="/stickers/stock"
                className="font-medium text-link underline underline-offset-2"
              >
                Add stickers to stock
              </Link>
            </p>
          ) : null}
        </Notice>
      </Section>
    );
  }

  const defaultSource: Source = confirmed[0]
    ? confirmed[0].feeTypeCode === FEE_FOR.OWN
      ? "OWN"
      : "STOCK"
    : state.registerHoldsBarcodeForPlate
      ? "OWN"
      : "STOCK";
  const source = chosenSource ?? defaultSource;
  const feeCode = FEE_FOR[source];
  const payment =
    confirmed.find((entry) => entry.feeTypeCode === feeCode) ?? null;
  // Both are possible only for a vehicle the register knows, while stock (or
  // a signed sticker) can replace the one it carried.
  const canChoose =
    state.registerHoldsBarcodeForPlate &&
    (state.stockHasStickers || NEW_STICKERS_IN_USE);
  const refusal = read ? cannotAttach(read, feeCode) : null;

  async function pay(where: "HERE" | "PAYER") {
    await run(async () => {
      setWaiting(null);
      let response: { authorizationUrl: string; totalChargedKobo: number };
      try {
        response = await api.post("/payments/initiate", {
          feeTypeCode: feeCode,
          subjectType: "vehicle",
          subjectId: vehicle.id,
          payerEmail: payerEmail.trim(),
          // Back to this panel, where the payment is checked and the scanner
          // opens.
          callbackUrl: `${window.location.origin}/vehicles/${vehicle.id}?assign=1`,
        });
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 503) {
          throw new ApiError(
            503,
            "Paystack could not start the payment just now. Nothing was taken. Try again in a moment.",
            caught.requestId,
          );
        }
        throw caught;
      }
      if (where === "HERE") {
        window.location.assign(response.authorizationUrl);
        return;
      }
      setStarted({
        url: response.authorizationUrl,
        // Drawn here, in the browser: the link goes to no QR service.
        qr: await QRCode.toDataURL(response.authorizationUrl, {
          margin: 1,
          width: 220,
        }),
        totalChargedKobo: response.totalChargedKobo,
      });
    });
  }

  async function readSticker(code: string) {
    setRead(null);
    if (stickerCodeScheme(code) === "SIGNED") {
      setRead({
        kind: "SIGNED",
        code,
        stickerQrId: code.split(".")[0] ?? code,
      });
      return;
    }
    await run(async () => {
      const response = await api.post<{ reading: StickerReading }>(
        `/stickers/onboarding/${vehicle.id}/reading`,
        { code },
      );
      setRead({ kind: "LEGACY", code, reading: response.reading });
    });
  }

  async function attach() {
    if (!read || !payment) {
      return;
    }
    await run(async () => {
      try {
        await api.post("/stickers/attach", {
          vehicleId: vehicle.id,
          paymentId: payment.id,
          ...(read.kind === "LEGACY"
            ? { legacyBarcode: read.code }
            : { stickerQrId: read.stickerQrId }),
        });
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 409) {
          throw new ApiError(
            409,
            "The sticker was not assigned. It may have been assigned or withdrawn a moment ago, or the payment used. Scan the sticker again to see where it stands. The exact reason is in the audit trail.",
            caught.requestId,
          );
        }
        throw caught;
      }
      toast.success(`Sticker assigned to ${vehicle.plateNumberDisplay}`);
      setRead(null);
      await Promise.all([mutate(), onChanged()]);
    });
  }

  const emailOk = /^\S+@\S+\.\S+$/.test(payerEmail.trim());

  return (
    <Section
      title="Assign a sticker"
      description="Pay the sticker fee, then scan the sticker. Assigning a sticker does not declare the vehicle; the two are separate and may happen in either order."
    >
      {error ? (
        <ErrorNotice message={error.message} requestId={error.requestId} />
      ) : null}

      {canChoose ? (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Which sticker?</legend>
          {(
            [
              ["OWN", "The sticker this vehicle already carries"],
              [
                "STOCK",
                "A sticker from stock, because its own is lost or damaged",
              ],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="stickerSource"
                value={value}
                checked={source === value}
                onChange={() => {
                  setChosenSource(value);
                  setStarted(null);
                  setWaiting(null);
                  setRead(null);
                }}
              />
              {label}
            </label>
          ))}
        </fieldset>
      ) : null}

      <ol className="grid">
        <Step number={1} title="Payment" done={payment !== null}>
          {payment ? (
            <p className="text-sm">
              <span className="font-semibold">
                Paid: {naira(payment.totalChargedKobo)}
              </span>
              {payment.confirmedAt ? ` on ${day(payment.confirmedAt)}` : ""}.{" "}
              <span className="text-muted-foreground">
                {payment.feeTypeLabel}, confirmed by Paystack and not yet used.
              </span>
            </p>
          ) : !holds("payment.initiate") ? (
            <p className="text-sm text-muted-foreground">
              The sticker fee has not been paid for this vehicle. Ask an officer
              who can take payments to take it.
            </p>
          ) : started ? (
            <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
              {/* eslint-disable-next-line @next/next/no-img-element -- a data URL drawn in the browser; there is nothing for next/image to optimise. */}
              <img
                src={started.qr}
                alt="QR code for the payment page"
                width={176}
                height={176}
                className="rounded-md border border-line bg-paper p-1"
              />
              <div className="grid min-w-0 gap-3">
                <p className="text-sm">
                  <span className="font-semibold">
                    {naira(started.totalChargedKobo)} to pay.
                  </span>{" "}
                  The payer scans this code with their own phone, or you open
                  the page here.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => window.location.assign(started.url)}
                  >
                    Open the payment page
                  </Button>
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => void checkPayment(feeCode)}
                  >
                    {busy ? "Checking…" : "They have paid: check"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              <p className="text-sm text-muted-foreground">
                {source === "OWN"
                  ? "The reattachment fee, for the sticker the vehicle carries."
                  : "The sticker fee, for a sticker from stock."}{" "}
                Paid by card or bank transfer on Paystack&apos;s page.
              </p>
              <Field
                label="Payer's email"
                htmlFor="onboardPayerEmail"
                hint="Paystack sends the receipt here."
                required
              >
                <TextInput
                  id="onboardPayerEmail"
                  type="email"
                  autoComplete="off"
                  value={payerEmail}
                  onChange={(event) => setPayerEmail(event.target.value)}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={busy || !emailOk}
                  onClick={() => void pay("HERE")}
                >
                  <CreditCard aria-hidden />
                  Pay now
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || !emailOk}
                  onClick={() => void pay("PAYER")}
                >
                  Pay on the payer&apos;s phone
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void checkPayment(feeCode)}
                >
                  Already paid? Check
                </Button>
              </div>
            </div>
          )}
          {waiting && !payment ? (
            <p className="text-sm text-muted-foreground" role="status">
              {waiting}
            </p>
          ) : null}
        </Step>

        <Step
          number={2}
          title="Scan the sticker"
          done={read !== null && refusal === null}
          locked={payment === null}
        >
          {payment === null ? (
            <p className="text-sm text-faint-foreground">
              Opens once the payment is confirmed.
            </p>
          ) : !read ? (
            <div className="grid gap-2">
              <p className="text-sm text-muted-foreground">
                {source === "OWN"
                  ? "Scan the QR code on the sticker the vehicle carries."
                  : "Take a sticker from stock and scan its QR code."}
              </p>
              <div>
                <ScanButton disabled={busy} onClick={() => setScanning(true)} />
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              <p className="text-sm">
                Read:{" "}
                <span className="font-mono font-semibold">
                  {read.kind === "LEGACY" ? read.code : read.stickerQrId}
                </span>
              </p>
              {refusal ? (
                <Notice tone="deny" title={refusal.title} role="alert">
                  {refusal.text}
                </Notice>
              ) : null}
              <div>
                <ScanButton
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setScanning(true)}
                >
                  Scan another
                </ScanButton>
              </div>
            </div>
          )}
        </Step>

        <Step
          number={3}
          title="Confirm"
          locked={payment === null || read === null || refusal !== null}
        >
          {payment && read && !refusal ? (
            <div className="grid gap-3">
              <p className="text-sm">
                Put this sticker on{" "}
                <span className="font-mono font-semibold">
                  {vehicle.plateNumberDisplay}
                </span>
                , then confirm. A sticker is assigned once in its life, and the
                payment is used with it.
              </p>
              <div>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void attach()}
                >
                  {busy ? "Assigning…" : "Assign this sticker"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-faint-foreground">
              After a sticker is scanned.
            </p>
          )}
        </Step>
      </ol>

      <StickerScanDialog
        open={scanning}
        onOpenChange={setScanning}
        description={
          source === "OWN"
            ? "Point the camera at the QR code on the sticker the vehicle carries."
            : "Point the camera at the QR code on a sticker from stock."
        }
        onCode={(code) => void readSticker(code)}
      />
    </Section>
  );
}
