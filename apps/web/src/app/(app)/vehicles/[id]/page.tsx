"use client";

import type { VehicleDetail } from "@nurtw/contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";

import { MemberPicker } from "@/components/member-picker";
import {
  Button,
  ErrorNotice,
  Field,
  Section,
  StatusChip,
  TextArea,
} from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { useSession } from "@/lib/session";

/**
 * One declaration, and the acts available upon it.
 *
 * The controls offered follow the declaration's status and the officer's
 * permissions — a courtesy, not a control: the API's guard refuses
 * regardless, and every service method re-asks the permission question
 * against the record's own organisation.
 */

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-black/45">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm">
        {value && value.length > 0 ? (
          value
        ) : (
          <span className="italic text-black/35">Not stated</span>
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
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [ownerLabel, setOwnerLabel] = useState<string | null>(null);
  const [ownerSyncedFor, setOwnerSyncedFor] = useState<string | undefined>(
    undefined,
  );

  const { data, error, isLoading, mutate } = useSWR<{ vehicle: VehicleDetail }>(
    `/vehicles/${params.id}`,
    fetcher,
  );

  const vehicle = data?.vehicle ?? null;
  const loadError = error instanceof ApiError ? error : null;

  // The owner picker's state tracks the loaded record, not the other way
  // around — reset whenever a different (or freshly reloaded) declaration
  // arrives, the same "adjust state during render" pattern the app shell
  // uses for the mobile nav, rather than an effect that would flash the
  // previous vehicle's owner for one frame.
  if (vehicle && ownerSyncedFor !== vehicle.id) {
    setOwnerSyncedFor(vehicle.id);
    setOwnerId(vehicle.declaredByMember?.id ?? null);
    setOwnerLabel(
      vehicle.declaredByMember
        ? `${vehicle.declaredByMember.surname}, ${vehicle.declaredByMember.firstName}`
        : null,
    );
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
    return <p className="text-sm text-black/50">Loading…</p>;
  }

  if (!vehicle) {
    return (
      <div className="grid gap-4">
        <ErrorNotice
          message={
            loadError?.status === 404
              ? "No such declaration, or it is outside your area of responsibility."
              : (loadError?.message ?? "The declaration could not be loaded.")
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

  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <Link
          href="/vehicles"
          className="text-sm text-black/55 underline-offset-2 hover:underline"
        >
          ← Vehicles
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-semibold tracking-tight">
            {vehicle.plateNumberDisplay}
          </h1>
          <StatusChip status={vehicle.status} />
          {vehicle.isLegacyImport ? (
            <span className="text-xs italic text-black/40">
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

      {isDisputed ? (
        <div className="rounded-md border border-[var(--verdict-caution)]/30 bg-[var(--verdict-caution-surface)] px-4 py-3 text-sm">
          <p className="font-semibold text-[var(--verdict-caution)]">
            Disputed
          </p>
          <p className="mt-1">
            Another declaration for this plate is currently active. This
            record is preserved, not deleted, until the dispute is resolved.
          </p>
        </div>
      ) : null}

      <Section title="Declaration">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Category" value={vehicle.vehicleCategory?.label ?? null} />
          <Detail label="Organisation" value={vehicle.organisation.name} />
          <Detail label="Make" value={vehicle.make} />
          <Detail label="Model" value={vehicle.model} />
          <Detail label="Colour" value={vehicle.color} />
          <Detail
            label="Declared"
            value={new Date(vehicle.declaredAt).toLocaleDateString("en-GB")}
          />
          {vehicle.declaredByMember ? (
            <Detail
              label="Declared by"
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
          <div className="border-t border-[var(--border-subtle)] pt-4">
            <Detail label="Notes" value={vehicle.notes} />
          </div>
        ) : null}
      </Section>

      {holds("vehicle.update") ? (
        <Section
          title="Owner"
          description="The member this vehicle is declared under. May be left unset — a declaration is valid against a branch or unit alone — and changed here at any time, independent of a status change."
        >
          <MemberPicker
            label="Member"
            htmlFor="ownerId"
            selectedId={ownerId}
            selectedLabel={ownerLabel}
            onSelect={(member) => {
              setOwnerId(member.id);
              setOwnerLabel(member.label);
            }}
            onClear={() => {
              setOwnerId(null);
              setOwnerLabel(null);
            }}
          />
          <div>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || ownerId === (vehicle.declaredByMember?.id ?? null)}
              onClick={() =>
                void act(() =>
                  api.patch(`/vehicles/${vehicle.id}`, {
                    declaredByMemberId: ownerId,
                  }),
                )
              }
            >
              Save owner
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
