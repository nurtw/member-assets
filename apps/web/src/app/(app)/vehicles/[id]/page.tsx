"use client";

import type { MasterDataEntry, VehicleDetail } from "@nurtw/contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";

import { VehicleDuesPanel } from "@/components/dues-panel";
import { MemberPicker } from "@/components/member-picker";
import { OnboardingSection } from "@/components/onboarding-section";
import {
  Button,
  ErrorNotice,
  Field,
  Section,
  Select,
  StatusChip,
  TextArea,
  TextInput,
} from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { useSession } from "@/lib/session";

/**
 * One vehicle, and the acts available upon it.
 *
 * The controls offered follow the vehicle's status and the officer's
 * permissions — a courtesy, not a control: the API's guard refuses
 * regardless, and every service method re-asks the permission question
 * against the record's own organisation.
 */

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-faint-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm">
        {value && value.length > 0 ? (
          value
        ) : (
          <span className="italic text-faint-foreground">Not stated</span>
        )}
      </dd>
    </div>
  );
}

export default function VehicleDetailPage() {
  const params = useParams<{ id: string }>();
  const { holds } = useSession();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [driverLabel, setDriverLabel] = useState<string | null>(null);
  const [syncedFor, setSyncedFor] = useState<string | undefined>(undefined);
  // Declaring a vehicle on record — only what the record lacks is asked for.
  const [declareRouteTypeId, setDeclareRouteTypeId] = useState("");
  const [declareOwnerName, setDeclareOwnerName] = useState("");
  const [declareOwnerPhone, setDeclareOwnerPhone] = useState("");
  const [declareOwnerAddress, setDeclareOwnerAddress] = useState("");
  // VEH-27 — why the letter is being reissued.
  const [letterReason, setLetterReason] = useState("");

  const { data, error, isLoading, mutate } = useSWR<{ vehicle: VehicleDetail }>(
    `/vehicles/${params.id}`,
    fetcher,
  );

  const vehicle = data?.vehicle ?? null;
  const loadError = error instanceof ApiError ? error : null;
  const isOnRecord = vehicle?.status === "ON_RECORD";
  const canDeclare = isOnRecord && holds("vehicle.declare");

  const { data: routeTypeList } = useSWR<{ entries: MasterDataEntry[] }>(
    canDeclare ? "/master-data/route-types" : null,
    fetcher,
  );

  // The driver picker's state tracks the loaded record, not the other way
  // around — reset whenever a different (or freshly reloaded) vehicle
  // arrives, the same "adjust state during render" pattern the app shell
  // uses for the mobile nav, rather than an effect that would flash the
  // previous vehicle's driver for one frame.
  if (vehicle && syncedFor !== vehicle.id) {
    setSyncedFor(vehicle.id);
    setDriverId(vehicle.declaredByMember?.id ?? null);
    setDriverLabel(
      vehicle.declaredByMember
        ? `${vehicle.declaredByMember.surname}, ${vehicle.declaredByMember.firstName}`
        : null,
    );
    setDeclareRouteTypeId(vehicle.routeType?.id ?? "");
    setDeclareOwnerName(vehicle.owner?.name ?? "");
    setDeclareOwnerPhone(vehicle.owner?.phone ?? "");
    setDeclareOwnerAddress(vehicle.owner?.address ?? "");
  }

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      setReason("");
      await mutate();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setActionError(caught);
      }
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-faint-foreground">Loading…</p>;
  }

  if (!vehicle) {
    return (
      <div className="grid gap-4">
        <ErrorNotice
          message={
            loadError?.status === 404
              ? "No such vehicle, or it is outside your area of responsibility."
              : (loadError?.message ?? "The vehicle could not be loaded.")
          }
          requestId={loadError?.requestId}
        />
        <Link href="/vehicles" className="text-sm underline underline-offset-2">
          Back to vehicles
        </Link>
      </div>
    );
  }

  const isActive = vehicle.status === "ACTIVE";
  const isSuspended = vehicle.status === "SUSPENDED";
  const isDisputed = vehicle.status === "DISPUTED";
  const canChangeStatus =
    holds("vehicle.suspend") && (isActive || isSuspended);
  const ownerIncomplete = !vehicle.owner?.name || !vehicle.owner?.phone;
  const routeTypes = routeTypeList?.entries ?? [];

  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <Link
          href="/vehicles"
          className="text-sm text-faint-foreground underline-offset-2 hover:underline"
        >
          ← Vehicles
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-semibold tracking-tight">
            {vehicle.plateNumberDisplay}
          </h1>
          {/* VEH-28 — present only for a holder of vehicle.declare. Everything
              keyed on the status below disappears with it. */}
          {vehicle.status ? <StatusChip status={vehicle.status} /> : null}
          {vehicle.isLegacyImport ? (
            <span className="text-xs italic text-faint-foreground">
              from the legacy migration
            </span>
          ) : null}
        </div>
      </div>

      {actionError ? (
        <ErrorNotice
          message={actionError.message}
          requestId={actionError.requestId}
        />
      ) : null}

      {isOnRecord ? (
        <div className="rounded-md border border-line bg-surface-muted px-4 py-3 text-sm">
          <p className="font-semibold">On record, not declared</p>
          <p className="mt-1">
            This vehicle is recorded with the Union but has not been declared.
            It counts for nothing outside the Union until it is declared and a
            sticker is attached.
          </p>
        </div>
      ) : null}

      {isDisputed ? (
        <div className="rounded-md border border-verdict-caution/30 bg-verdict-caution-surface px-4 py-3 text-sm">
          <p className="font-semibold text-verdict-caution">
            Disputed
          </p>
          <p className="mt-1">
            Another declaration for this plate is currently active. This
            record is preserved, not deleted, until the dispute is resolved.
          </p>
        </div>
      ) : null}

      <Section title="Vehicle">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Route type" value={vehicle.routeType?.label ?? null} />
          <Detail
            label="Vehicle type"
            value={vehicle.vehicleCategory?.label ?? null}
          />
          <Detail label="Organisation" value={vehicle.organisation.name} />
          <Detail label="Make" value={vehicle.make} />
          <Detail label="Model" value={vehicle.model} />
          <Detail label="Colour" value={vehicle.color} />
          {vehicle.status !== undefined ? (
            <Detail
              label="Declared"
              value={
                vehicle.declaredAt
                  ? new Date(vehicle.declaredAt).toLocaleDateString("en-GB")
                  : "Not yet declared"
              }
            />
          ) : null}
          {/* Requirement 9A.1 — onboarded is its own fact, beside declared. */}
          <Detail
            label="Onboarded"
            value={
              vehicle.onboarding
                ? `${new Date(vehicle.onboarding.attachedAt).toLocaleDateString("en-GB")} · ${
                    vehicle.onboarding.kind === "LEGACY"
                      ? "Transpay sticker reattached"
                      : "NURTW sticker"
                  }${vehicle.onboarding.attachedBy ? ` · by ${vehicle.onboarding.attachedBy}` : ""}`
                : "Not yet onboarded"
            }
          />
          {vehicle.declaredByMember ? (
            <Detail
              label="Driver"
              value={`${vehicle.declaredByMember.surname}, ${vehicle.declaredByMember.firstName}`}
            />
          ) : null}
          {"chassisVinRestricted" in vehicle ? (
            <Detail
              label="Chassis / VIN"
              value={vehicle.chassisVinRestricted ?? null}
            />
          ) : null}
        </dl>
        {vehicle.notes ? (
          <div className="border-t border-line pt-4">
            <Detail label="Notes" value={vehicle.notes} />
          </div>
        ) : null}
      </Section>

      <Section
        title="Owner"
        description="Whoever owns the vehicle — not necessarily a member. Private: never shown on a scan or to an outside organisation."
      >
        <dl className="grid gap-4 sm:grid-cols-3">
          <Detail label="Name" value={vehicle.owner?.name ?? null} />
          <Detail label="Phone" value={vehicle.owner?.phone ?? null} />
          <Detail label="Address" value={vehicle.owner?.address ?? null} />
        </dl>
      </Section>

      {canDeclare ? (
        <Section
          title="Declare this vehicle"
          description="Declares this same record — no second record is created. A route type and the owner's name and phone are required."
        >
          <Field label="Route type" htmlFor="declareRouteTypeId" required>
            <Select
              id="declareRouteTypeId"
              value={declareRouteTypeId}
              onChange={(event) => setDeclareRouteTypeId(event.target.value)}
            >
              <option value="">Select a route type</option>
              {routeTypes.map((routeType) => (
                <option key={routeType.id} value={routeType.id}>
                  {routeType.label}
                </option>
              ))}
            </Select>
          </Field>
          {ownerIncomplete ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Owner's name" htmlFor="declareOwnerName" required>
                <TextInput
                  id="declareOwnerName"
                  value={declareOwnerName}
                  onChange={(event) => setDeclareOwnerName(event.target.value)}
                />
              </Field>
              <Field label="Owner's phone" htmlFor="declareOwnerPhone" required>
                <TextInput
                  id="declareOwnerPhone"
                  inputMode="tel"
                  autoComplete="off"
                  value={declareOwnerPhone}
                  onChange={(event) => setDeclareOwnerPhone(event.target.value)}
                />
              </Field>
              <Field label="Owner's address" htmlFor="declareOwnerAddress">
                <TextInput
                  id="declareOwnerAddress"
                  value={declareOwnerAddress}
                  onChange={(event) =>
                    setDeclareOwnerAddress(event.target.value)
                  }
                />
              </Field>
            </div>
          ) : null}
          <div>
            <Button
              type="button"
              disabled={
                busy ||
                !declareRouteTypeId ||
                (ownerIncomplete && (!declareOwnerName || !declareOwnerPhone))
              }
              onClick={() =>
                void act(() =>
                  api.post(`/vehicles/${vehicle.id}/declare`, {
                    ...(declareRouteTypeId !== (vehicle.routeType?.id ?? "")
                      ? { routeTypeId: declareRouteTypeId }
                      : {}),
                    ...(ownerIncomplete
                      ? {
                          owner: {
                            name: declareOwnerName,
                            phone: declareOwnerPhone,
                            address: declareOwnerAddress.trim() || undefined,
                          },
                        }
                      : {}),
                  }),
                )
              }
            >
              Declare this vehicle
            </Button>
          </div>
        </Section>
      ) : null}

      {holds("sticker.attach") ? (
        <OnboardingSection vehicle={vehicle} onChanged={() => mutate()} />
      ) : null}

      <VehicleDuesPanel vehicleId={vehicle.id} />

      {vehicle.onboarding?.letterReference ? (
        <Section
          title="Vehicle letter"
          description="Produced when the vehicle was onboarded, and printed exactly as issued. It confirms the vehicle is recorded with the Union; it is not evidence of ownership, roadworthiness, licensing, or insurance. A reissued letter replaces it under a new reference."
        >
          <div className="flex flex-wrap items-center gap-4">
            <Detail label="Reference" value={vehicle.onboarding.letterReference} />
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void act(() =>
                  api.download(
                    `/vehicles/${vehicle.id}/letter`,
                    "nurtw-vehicle-letter.pdf",
                  ),
                )
              }
            >
              Download letter
            </Button>
          </div>
          {holds("sticker.attach") ? (
            <div className="grid gap-3 border-t border-line pt-4">
              <Field
                label="Reason for reissuing"
                htmlFor="letterReason"
                hint="For example, a driver has been linked or the vehicle has moved unit. The current letter is kept, marked superseded, and will no longer download."
              >
                <TextInput
                  id="letterReason"
                  value={letterReason}
                  onChange={(event) => setLetterReason(event.target.value)}
                  maxLength={1000}
                />
              </Field>
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || letterReason.trim().length < 4}
                  onClick={() =>
                    void act(async () => {
                      try {
                        await api.post(`/vehicles/${vehicle.id}/letter/reissue`, {
                          reason: letterReason.trim(),
                        });
                        setLetterReason("");
                      } catch (caught) {
                        // The API's 409 is generic (Requirement 14.3).
                        if (caught instanceof ApiError && caught.status === 409) {
                          throw new ApiError(
                            409,
                            "The letter was reissued by someone else a moment ago. The page now shows it.",
                            caught.requestId,
                          );
                        }
                        throw caught;
                      }
                    })
                  }
                >
                  Reissue letter
                </Button>
              </div>
            </div>
          ) : null}
        </Section>
      ) : null}

      {holds("vehicle.update") ? (
        <Section
          title="Driver"
          description="The member who drives this vehicle. May be left unset and changed here at any time, independent of a status change."
        >
          <MemberPicker
            label="Member"
            htmlFor="driverId"
            selectedId={driverId}
            selectedLabel={driverLabel}
            onSelect={(member) => {
              setDriverId(member.id);
              setDriverLabel(member.label);
            }}
            onClear={() => {
              setDriverId(null);
              setDriverLabel(null);
            }}
          />
          <div>
            <Button
              type="button"
              variant="secondary"
              disabled={
                busy || driverId === (vehicle.declaredByMember?.id ?? null)
              }
              onClick={() =>
                void act(() =>
                  api.patch(`/vehicles/${vehicle.id}`, {
                    declaredByMemberId: driverId,
                  }),
                )
              }
            >
              Save driver
            </Button>
          </div>
        </Section>
      ) : null}

      {isDisputed && holds("vehicle.resolve_dispute") ? (
        <Section
          title="Dispute"
          description="Dismisses this claim. Upholding a claim instead — which would demote whichever declaration currently holds ACTIVE for this plate — is not built; that decision is still open with the Union."
        >
          <Field label="Reason" htmlFor="dismissReason" required>
            <TextArea
              id="dismissReason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <div>
            <Button
              type="button"
              variant="danger"
              disabled={busy || reason.trim().length < 4}
              onClick={() =>
                void act(() =>
                  api.post(`/vehicles/${vehicle.id}/dismiss-dispute`, {
                    reason: reason.trim(),
                  }),
                )
              }
            >
              Dismiss this claim
            </Button>
          </div>
        </Section>
      ) : null}

      {canChangeStatus ? (
        <Section
          title="Status"
          description="A reason is required and is recorded in the audit trail."
        >
          <Field label="Reason" htmlFor="statusReason">
            <TextArea
              id="statusReason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>

          <div className="flex flex-wrap gap-3">
            {isSuspended ? (
              <Button
                type="button"
                disabled={busy || reason.trim().length < 4}
                onClick={() =>
                  void act(() =>
                    api.patch(`/vehicles/${vehicle.id}/status`, {
                      status: "ACTIVE",
                      reason: reason.trim(),
                    }),
                  )
                }
              >
                Reactivate
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                disabled={busy || reason.trim().length < 4}
                onClick={() =>
                  void act(() =>
                    api.patch(`/vehicles/${vehicle.id}/status`, {
                      status: "SUSPENDED",
                      reason: reason.trim(),
                    }),
                  )
                }
              >
                Suspend
              </Button>
            )}
            <Button
              type="button"
              variant="danger"
              disabled={busy || reason.trim().length < 4}
              onClick={() =>
                void act(() =>
                  api.patch(`/vehicles/${vehicle.id}/status`, {
                    status: "RETIRED",
                    reason: reason.trim(),
                  }),
                )
              }
            >
              Retire
            </Button>
          </div>
        </Section>
      ) : null}
    </div>
  );
}
