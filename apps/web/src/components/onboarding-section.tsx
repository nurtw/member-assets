"use client";

import type {
  MasterDataEntry,
  OnboardingState,
  VehicleDetail,
} from "@nurtw/contracts";
import { normalizePlateNumber, type LegacyBarcodeReading } from "@nurtw/domain";
import { useState } from "react";
import useSWR from "swr";

import {
  Button,
  ErrorNotice,
  Field,
  Section,
  Select,
  TextInput,
} from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { useSession } from "@/lib/session";

/**
 * Onboarding a vehicle (PRD §9A, item 17): attaching a sticker after a
 * confirmed onboarding payment made for this vehicle.
 *
 * The API refuses with a generic 409 and keeps the reason in the audit trail
 * (Requirement 14.3), so this screen does its checking up front: it reads the
 * barcode against the register before attaching, and offers only payments the
 * API would accept. The explanation below covers whatever is left.
 */

type Method = "LEGACY" | "SIGNED";

const FEE_FOR: Record<Method, string> = {
  LEGACY: "STICKER_REATTACHMENT",
  SIGNED: "STICKER_NEW",
};

function naira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

function samePlate(registered: string, display: string): boolean {
  try {
    return normalizePlateNumber(display) === registered;
  } catch {
    return false;
  }
}

function explainAttachConflict(error: ApiError, method: Method): ApiError {
  if (error.status === 404 && method === "SIGNED") {
    return new ApiError(
      404,
      "No issued sticker has that number. Check it against the printed sticker.",
      error.requestId,
      error.details,
    );
  }
  if (error.status !== 409) {
    return error;
  }
  return new ApiError(
    409,
    method === "LEGACY"
      ? "The Transpay sticker was not attached. The barcode must be read from the sticker on this vehicle, be on the register for this plate, and never have been attached before. The vehicle must not already carry a sticker, and the payment must be a confirmed reattachment payment for this vehicle, not used before. The exact reason is in the audit trail."
      : "The sticker was not attached. It must be an issued NURTW sticker never attached before, the vehicle must not already carry one, and the payment must be a confirmed new-sticker payment for this vehicle, not used before. The exact reason is in the audit trail.",
    error.requestId,
    error.details,
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
  const [method, setMethod] = useState<Method | null>(null);
  const [barcode, setBarcode] = useState("");
  const [reading, setReading] = useState<LegacyBarcodeReading | "UNKNOWN" | null>(null);
  const [stickerNumber, setStickerNumber] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [routeTypeId, setRouteTypeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const { data, mutate } = useSWR<{ onboarding: OnboardingState }>(
    `/stickers/onboarding/${vehicle.id}`,
    fetcher,
  );
  const state = data?.onboarding ?? null;

  const needsRouteType = state !== null && !state.hasRouteType;
  const { data: routeTypeList } = useSWR<{ entries: MasterDataEntry[] }>(
    needsRouteType && holds("vehicle.update") ? "/master-data/route-types" : null,
    fetcher,
  );

  async function run(action: () => Promise<unknown>, explain?: (e: ApiError) => ApiError) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(explain ? explain(caught) : caught);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!state) {
    return null;
  }

  if (state.attachment) {
    const { attachment } = state;
    return (
      <Section title="Onboarding">
        <div className="rounded-md border border-[var(--verdict-affirm)]/30 bg-[var(--verdict-affirm-surface)] px-4 py-3 text-sm">
          <p className="font-semibold text-[var(--verdict-affirm)]">Onboarded</p>
          <p className="mt-1">
            {attachment.kind === "LEGACY"
              ? "Transpay sticker reattached"
              : "NURTW sticker attached"}{" "}
            on {new Date(attachment.attachedAt).toLocaleDateString("en-GB")}
            {attachment.attachedBy ? ` by ${attachment.attachedBy}` : ""}.
          </p>
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-black/45">
              Sticker number
            </dt>
            <dd className="mt-0.5 font-mono text-sm">{attachment.stickerNumber}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-black/45">
              Sticker status
            </dt>
            <dd className="mt-0.5 text-sm">{attachment.stickerStatus.replace(/_/g, " ")}</dd>
          </div>
        </dl>
      </Section>
    );
  }

  const feeCode = method ? FEE_FOR[method] : null;
  const payments = state.eligiblePayments.filter((p) => p.feeTypeCode === feeCode);
  const legacyReady =
    method === "LEGACY" &&
    barcode.trim().length > 0 &&
    // Where the officer can check the register, the check must have passed;
    // otherwise the API decides alone.
    (!holds("verification.perform") ||
      (reading !== null &&
        reading !== "UNKNOWN" &&
        reading.result === "RECOGNISED_NOT_ATTACHED" &&
        samePlate(reading.registeredPlate, vehicle.plateNumberDisplay)));
  const signedReady = method === "SIGNED" && stickerNumber.trim().length > 0;
  const canAttach = (legacyReady || signedReady) && paymentId !== "";

  return (
    <Section
      title="Onboard this vehicle"
      description="Attach a sticker after the onboarding fee is paid. Onboarding does not declare the vehicle; the two are separate and may happen in either order."
    >
      {error ? <ErrorNotice message={error.message} requestId={error.requestId} /> : null}

      {needsRouteType ? (
        <div className="grid gap-3">
          <p className="text-sm">
            <span className="font-semibold">Route type needed first.</span> The monthly
            levy starts after onboarding and is priced by route type, so a vehicle
            without one cannot be onboarded.
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
            <p className="text-sm text-black/60">
              Ask an officer who can amend vehicles to set one.
            </p>
          )}
        </div>
      ) : (
        <>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">How is it being onboarded?</legend>
            <p className="text-xs text-black/55">
              {state.registerHoldsBarcodeForPlate
                ? "The Transpay register holds a barcode for this plate. If the vehicle carries that sticker, reattach it."
                : "The Transpay register holds no unattached barcode for this plate, so a Transpay sticker cannot be reattached. Attach a new NURTW sticker."}
            </p>
            {(
              [
                ["LEGACY", "Reattach the Transpay sticker on the vehicle"],
                ["SIGNED", "Attach a new NURTW sticker"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="onboardMethod"
                  value={value}
                  checked={method === value}
                  disabled={value === "LEGACY" && !state.registerHoldsBarcodeForPlate}
                  onChange={() => {
                    setMethod(value);
                    setPaymentId("");
                    setPaymentLink(null);
                  }}
                />
                {label}
              </label>
            ))}
          </fieldset>

          {method === "LEGACY" ? (
            <div className="grid gap-3">
              <Field
                label="Barcode"
                htmlFor="onboardBarcode"
                hint="Scan or type it from the sticker on the vehicle."
                required
              >
                <TextInput
                  id="onboardBarcode"
                  inputMode="numeric"
                  autoComplete="off"
                  value={barcode}
                  onChange={(event) => {
                    setBarcode(event.target.value);
                    setReading(null);
                  }}
                />
              </Field>
              {holds("verification.perform") ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy || barcode.trim().length === 0}
                    onClick={() =>
                      void run(async () => {
                        try {
                          const response = await api.post<{ reading: LegacyBarcodeReading }>(
                            "/stickers/legacy-lookup",
                            { barcode: barcode.trim() },
                          );
                          setReading(response.reading);
                        } catch (caught) {
                          if (caught instanceof ApiError && caught.status === 404) {
                            setReading("UNKNOWN");
                            return;
                          }
                          throw caught;
                        }
                      })
                    }
                  >
                    Check barcode
                  </Button>
                  {reading === "UNKNOWN" ? (
                    <p className="text-sm">
                      <span className="font-semibold">Not on the Transpay register.</span>{" "}
                      It can never be attached. Attach a new NURTW sticker instead.
                    </p>
                  ) : reading?.result === "ATTACHED" ? (
                    <p className="text-sm">
                      <span className="font-semibold">Already attached</span> to{" "}
                      <span className="font-mono">{reading.attachedPlate}</span>. A barcode
                      attaches once in its life.
                    </p>
                  ) : reading?.result === "RECOGNISED_NOT_ATTACHED" ? (
                    samePlate(reading.registeredPlate, vehicle.plateNumberDisplay) ? (
                      <p className="text-sm">
                        <span className="font-semibold">{reading.message}.</span> Recorded
                        for <span className="font-mono">{reading.registeredPlate}</span>, this
                        plate.
                      </p>
                    ) : (
                      <p className="text-sm">
                        <span className="font-semibold">Recorded for another plate</span> (
                        <span className="font-mono">{reading.registeredPlate}</span>). It
                        cannot be attached to this vehicle, and there is no override.
                      </p>
                    )
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {method === "SIGNED" ? (
            <Field
              label="Sticker number"
              htmlFor="onboardStickerNumber"
              hint="As printed on the new sticker."
              required
            >
              <TextInput
                id="onboardStickerNumber"
                autoComplete="off"
                value={stickerNumber}
                onChange={(event) => setStickerNumber(event.target.value)}
              />
            </Field>
          ) : null}

          {method ? (
            <div className="grid gap-3">
              {payments.length > 0 ? (
                <Field label="Payment" htmlFor="onboardPayment" required>
                  <Select
                    id="onboardPayment"
                    value={paymentId}
                    onChange={(event) => setPaymentId(event.target.value)}
                  >
                    <option value="">Select a confirmed payment</option>
                    {payments.map((payment) => (
                      <option key={payment.id} value={payment.id}>
                        {payment.feeTypeLabel} · {naira(payment.totalChargedKobo)}
                        {payment.confirmedAt
                          ? ` · ${new Date(payment.confirmedAt).toLocaleDateString("en-GB")}`
                          : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <div className="grid gap-3">
                  <p className="text-sm">
                    <span className="font-semibold">No confirmed payment yet.</span> The{" "}
                    {method === "LEGACY" ? "reattachment" : "new-sticker"} fee must be paid
                    for this vehicle first.
                  </p>
                  {holds("payment.initiate") ? (
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="min-w-0 flex-1">
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
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy || !payerEmail.includes("@")}
                        onClick={() =>
                          void run(async () => {
                            const response = await api.post<{ authorizationUrl: string }>(
                              "/payments/initiate",
                              {
                                feeTypeCode: feeCode,
                                subjectType: "vehicle",
                                subjectId: vehicle.id,
                                payerEmail: payerEmail.trim(),
                                callbackUrl: window.location.href,
                              },
                            );
                            setPaymentLink(response.authorizationUrl);
                          })
                        }
                      >
                        Create payment link
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-black/60">
                      Ask an officer who can start payments to create a payment link.
                    </p>
                  )}
                  {paymentLink ? (
                    <p className="text-sm">
                      <a
                        href={paymentLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold underline underline-offset-2"
                      >
                        Open the Paystack payment page
                      </a>
                      . Once Paystack confirms the payment, refresh to continue.
                    </p>
                  ) : null}
                  <div>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void mutate()}
                    >
                      Refresh payments
                    </Button>
                  </div>
                </div>
              )}

              <div>
                <Button
                  type="button"
                  disabled={busy || !canAttach}
                  onClick={() =>
                    void run(
                      async () => {
                        await api.post("/stickers/attach", {
                          vehicleId: vehicle.id,
                          paymentId,
                          ...(method === "LEGACY"
                            ? { legacyBarcode: barcode.trim() }
                            : { stickerQrId: stickerNumber.trim() }),
                        });
                        await Promise.all([mutate(), onChanged()]);
                      },
                      (caught) => explainAttachConflict(caught, method),
                    )
                  }
                >
                  Attach sticker
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </Section>
  );
}
