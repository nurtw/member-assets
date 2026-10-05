"use client";

import type { FeeTypeSummary, MasterDataEntry } from "@nurtw/contracts";
import { useState } from "react";
import useSWR from "swr";

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
 * Fee settings (PRD Requirements 27.1–27.2, revision 1.3).
 *
 * Every amount here is data the Union changes without a release. Each change
 * needs a reason and is audited before and after. The levy is priced per route
 * type (`QUESTIONS.md` PAY-14); a route type without its own amount is charged
 * the default.
 *
 * Amounts are typed in naira and sent as integer kobo — the API never accepts
 * a float (Requirement 27.2).
 */

function naira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", {
    minimumFractionDigits: kobo % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "7,000" or "7000.50" → kobo; `null` when it is not a positive amount. */
function toKobo(input: string): number | null {
  const cleaned = input.replace(/[₦,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return null;
  }
  const kobo = Math.round(Number(cleaned) * 100);
  return kobo > 0 ? kobo : null;
}

const RECURRENCE: Record<string, string> = {
  ONE_OFF: "One-off",
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
};

/** One editable amount: the default, or one route type's. */
function AmountEditor({
  label,
  currentKobo,
  onSave,
}: {
  label: string;
  currentKobo: number | null;
  onSave: (amountKobo: number, reason: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const kobo = toKobo(amount);
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 py-2">
        <div>
          <p className="text-sm">{label}</p>
          <p className="text-base font-semibold">
            {currentKobo === null ? (
              <span className="text-sm font-normal italic text-faint-foreground">
                Uses the default
              </span>
            ) : (
              naira(currentKobo)
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setAmount(currentKobo === null ? "" : String(currentKobo / 100));
            setReason("");
            setError(null);
            setEditing(true);
          }}
        >
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-3 rounded-md border border-line p-3">
      {error ? (
        <ErrorNotice message={error.message} requestId={error.requestId} />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`${label} (₦)`} htmlFor={`${id}-amount`} required>
          <TextInput
            id={`${id}-amount`}
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
        <Field
          label="Reason for the change"
          htmlFor={`${id}-reason`}
          required
          hint="Recorded in the audit trail."
        >
          <TextInput
            id={`${id}-reason`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </div>
      <div className="flex gap-3">
        <Button
          type="button"
          disabled={busy || kobo === null || reason.trim().length < 4}
          onClick={async () => {
            if (kobo === null) return;
            setBusy(true);
            setError(null);
            try {
              await onSave(kobo, reason.trim());
              setEditing(false);
            } catch (caught) {
              setError(
                caught instanceof ApiError
                  ? caught
                  : new ApiError(0, "The service could not be reached."),
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Save
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => setEditing(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default function FeeSettingsPage() {
  const { holds } = useSession();
  const canManage = holds("fee_type.manage");

  const { data, error, isLoading, mutate } = useSWR<{
    feeTypes: FeeTypeSummary[];
  }>("/fee-types", fetcher);
  const { data: routeTypeList } = useSWR<{ entries: MasterDataEntry[] }>(
    "/master-data/route-types",
    fetcher,
  );

  const feeTypes = data?.feeTypes ?? [];
  const routeTypes = routeTypeList?.entries ?? [];
  const loadError = error instanceof ApiError ? error : null;

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader
        title="Fees"
        description="What each payment costs. Changes take effect for payments started afterwards; a payment already started keeps its amount. Every change needs a reason and is recorded in the audit trail."
      />

      {loadError ? (
        <ErrorNotice message={loadError.message} requestId={loadError.requestId} />
      ) : null}

      {isLoading ? <Loading /> : null}

      {feeTypes.map((feeType) => {
        // Only vehicle-charged fees can differ by route type; the levy is the
        // one priced that way at launch (PAY-14).
        const pricedByRoute = feeType.chargedAgainst === "VEHICLE" &&
          feeType.recurrence !== "ONE_OFF";
        return (
          <Section
            key={feeType.code}
            title={feeType.label}
            description={`${RECURRENCE[feeType.recurrence] ?? feeType.recurrence}, charged per ${
              feeType.chargedAgainst === "VEHICLE" ? "vehicle" : "member"
            }. ${
              feeType.settlement === "SPLIT_WITH_NURTW"
                ? "Settles to the NURTW account."
                : "Settles to the contractor."
            }${feeType.active ? "" : " Not currently offered."}`}
          >
            <div className="divide-y divide-line">
              {canManage ? (
                <AmountEditor
                  label={pricedByRoute ? "Default amount" : "Amount"}
                  currentKobo={feeType.amountKobo}
                  onSave={async (amountKobo, reason) => {
                    await api.patch(`/fee-types/${feeType.code}`, {
                      amountKobo,
                      reason,
                    });
                    await mutate();
                  }}
                />
              ) : (
                <p className="py-2 text-base font-semibold">
                  {naira(feeType.amountKobo)}
                </p>
              )}

              {pricedByRoute
                ? routeTypes.map((routeType) => {
                    const price = feeType.prices.find(
                      (candidate) => candidate.routeType.id === routeType.id,
                    );
                    return canManage ? (
                      <AmountEditor
                        key={routeType.id}
                        label={routeType.label}
                        currentKobo={price?.amountKobo ?? null}
                        onSave={async (amountKobo, reason) => {
                          await api.put(
                            `/fee-types/${feeType.code}/prices/${routeType.code}`,
                            { amountKobo, reason },
                          );
                          await mutate();
                        }}
                      />
                    ) : (
                      <p key={routeType.id} className="py-2 text-sm">
                        {routeType.label}:{" "}
                        <span className="font-semibold">
                          {naira(price?.amountKobo ?? feeType.amountKobo)}
                        </span>
                      </p>
                    );
                  })
                : null}
            </div>
          </Section>
        );
      })}
    </div>
  );
}
