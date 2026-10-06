"use client";

import type { MasterDataEntry, VehicleDetail } from "@nurtw/contracts";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

import { VehicleDuesPanel } from "@/components/dues-panel";
import { MemberPicker } from "@/components/member-picker";
import { OnboardingSection } from "@/components/onboarding-section";
import {
  StickerBanner,
  StickerPromptDialog,
} from "@/components/sticker-prompt";
import {
  Button,
  Detail,
  DetailList,
  ErrorNotice,
  Field,
  Loading,
  Notice,
  PageHeader,
  Section,
  Select,
  StatusChip,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextInput,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError, api, fetcher } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useTabParam } from "@/lib/use-tab-param";

/**
 * One vehicle, and the acts available upon it.
 *
 * The controls offered follow the vehicle's status and the officer's
 * permissions — a courtesy, not a control: the API's guard refuses
 * regardless, and every service method re-asks the permission question
 * against the record's own organisation.
 *
 * The page is a record in tabs (`DESIGN.md` §10): its details; its sticker,
 * where one is assigned and the vehicle letter kept; its levy; and the acts
 * that manage it. The open tab is kept in the address.
 */

const TAB_LABELS = {
  details: "Details",
  sticker: "Sticker",
  levy: "Levy",
  manage: "Manage",
} as const;
type TabName = keyof typeof TAB_LABELS;

/** An act that is confirmed in a dialog, with its reason. */
type Confirming = "SUSPEND" | "REACTIVATE" | "RETIRE" | "DISMISS" | "REISSUE";

const CONFIRM: Record<
  Confirming,
  {
    title: string;
    description: string;
    confirmLabel: string;
    tone: "danger" | "primary";
    done: string;
  }
> = {
  SUSPEND: {
    title: "Suspend this vehicle?",
    description:
      "Its declaration is suspended until an officer reactivates it. While suspended it does not verify outside the Union.",
    confirmLabel: "Suspend",
    tone: "primary",
    done: "Vehicle suspended",
  },
  REACTIVATE: {
    title: "Reactivate this vehicle?",
    description: "Its declaration becomes active again.",
    confirmLabel: "Reactivate",
    tone: "primary",
    done: "Vehicle reactivated",
  },
  RETIRE: {
    title: "Retire this vehicle?",
    description:
      "Retiring ends this declaration for good. The record is kept, and the monthly levy stops after this month.",
    confirmLabel: "Retire the vehicle",
    tone: "danger",
    done: "Vehicle retired",
  },
  DISMISS: {
    title: "Dismiss this claim?",
    description:
      "This disputed declaration is dismissed. Upholding a claim instead, which would demote whichever declaration currently holds the plate, is not built: that decision is still open with the Union.",
    confirmLabel: "Dismiss this claim",
    tone: "danger",
    done: "Claim dismissed",
  },
  REISSUE: {
    title: "Reissue the vehicle letter?",
    description:
      "For when a driver has been linked or the vehicle has moved unit. The current letter is kept, marked superseded, and will no longer download. The new one carries a new reference.",
    confirmLabel: "Reissue the letter",
    tone: "primary",
    done: "Letter reissued",
  },
};

function day(value: string): string {
  return new Date(value).toLocaleDateString("en-GB");
}

export default function VehicleDetailPage() {
  const params = useParams<{ id: string }>();
  const { holds } = useSession();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [driverLabel, setDriverLabel] = useState<string | null>(null);
  const [syncedFor, setSyncedFor] = useState<string | undefined>(undefined);
  // Declaring a vehicle on record — only what the record lacks is asked for.
  const [declareRouteTypeId, setDeclareRouteTypeId] = useState("");
  const [declareOwnerName, setDeclareOwnerName] = useState("");
  const [declareOwnerPhone, setDeclareOwnerPhone] = useState("");
  const [declareOwnerAddress, setDeclareOwnerAddress] = useState("");
  // Item 35 (VEH-30). Adding a vehicle arrives here with ?added=1 and a
  // prompt to assign its sticker. ?assign=1 opens the Sticker tab: from the
  // registration flow, from Home, and on the way back from paying. Either is
  // spent on first use.
  const router = useRouter();
  const searchParams = useSearchParams();
  const justAdded = searchParams.get("added") === "1";
  const sentToAssign = searchParams.get("assign") === "1";
  const [promptClosed, setPromptClosed] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<{ vehicle: VehicleDetail }>(
    `/vehicles/${params.id}`,
    fetcher,
  );

  const vehicle = data?.vehicle ?? null;
  const loadError = error instanceof ApiError ? error : null;
  const isOnRecord = vehicle?.status === "ON_RECORD";
  const isActive = vehicle?.status === "ACTIVE";
  const isSuspended = vehicle?.status === "SUSPENDED";
  const isDisputed = vehicle?.status === "DISPUTED";
  const canDeclare = isOnRecord && holds("vehicle.declare");
  const canChangeStatus = holds("vehicle.suspend") && (isActive || isSuspended);
  const canDismiss = isDisputed && holds("vehicle.resolve_dispute");

  // A tab is offered only where it has something for this officer.
  const offersSticker =
    vehicle !== null &&
    (holds("sticker.attach") || Boolean(vehicle.onboarding?.letterReference));
  const offersManage =
    vehicle !== null &&
    (holds("vehicle.update") || canDismiss || canChangeStatus);
  const tabs: { value: TabName }[] = [
    { value: "details" },
    ...(offersSticker ? [{ value: "sticker" as const }] : []),
    { value: "levy" },
    ...(offersManage ? [{ value: "manage" as const }] : []),
  ];
  const [tabInAddress] = useTabParam(tabs);
  // Sent to assign a sticker: the Sticker tab is open from the first render,
  // so its panel is there to notice a payment just made.
  const tab = sentToAssign && offersSticker ? "sticker" : tabInAddress;

  function openTab(next: TabName) {
    // The arrival's own values (added, assign, a payment's reference) are
    // spent with this: only the tab is kept.
    router.replace(
      next === "details"
        ? `/vehicles/${params.id}`
        : `/vehicles/${params.id}?tab=${next}`,
      { scroll: false },
    );
  }

  /** Item 35 — to the Sticker tab, where a sticker is assigned. */
  function goToSticker() {
    openTab("sticker");
    window.setTimeout(() => {
      const panel = document.getElementById("record-tabs");
      panel?.scrollIntoView({ behavior: "smooth", block: "start" });
      panel?.focus({ preventScroll: true });
    }, 50);
  }

  const vehicleLoaded = vehicle !== null;
  useEffect(() => {
    if (sentToAssign && vehicleLoaded) {
      router.replace(
        offersSticker
          ? `/vehicles/${params.id}?tab=sticker`
          : `/vehicles/${params.id}`,
        { scroll: false },
      );
      document
        .getElementById("record-tabs")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [sentToAssign, vehicleLoaded, offersSticker, router, params.id]);

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

  async function act(action: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      await mutate();
      if (done) {
        toast.success(done);
      }
    } catch (caught) {
      if (caught instanceof ApiError) {
        setActionError(caught);
      }
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return <Loading label="Loading the vehicle" />;
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

  const ownerIncomplete = !vehicle.owner?.name || !vehicle.owner?.phone;
  const routeTypes = routeTypeList?.entries ?? [];

  /** Does a confirmed act. A failure is thrown, and shown in its dialog. */
  async function confirmed(which: Confirming, reason: string) {
    if (!vehicle) {
      return;
    }
    if (which === "DISMISS") {
      await api.post(`/vehicles/${vehicle.id}/dismiss-dispute`, { reason });
    } else if (which === "REISSUE") {
      try {
        await api.post(`/vehicles/${vehicle.id}/letter/reissue`, { reason });
      } catch (caught) {
        // The API's 409 is generic (Requirement 14.3).
        if (caught instanceof ApiError && caught.status === 409) {
          await mutate();
          throw new ApiError(
            409,
            "The letter was reissued by someone else a moment ago. The page now shows it.",
            caught.requestId,
          );
        }
        throw caught;
      }
    } else {
      await api.patch(`/vehicles/${vehicle.id}/status`, {
        status:
          which === "SUSPEND"
            ? "SUSPENDED"
            : which === "REACTIVATE"
              ? "ACTIVE"
              : "RETIRED",
        reason,
      });
    }
    toast.success(CONFIRM[which].done);
    await mutate();
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader
        mono
        title={vehicle.plateNumberDisplay}
        back={{ href: "/vehicles", label: "Vehicles" }}
        // VEH-28 — present only for a holder of vehicle.declare. Everything
        // keyed on the status below disappears with it.
        status={vehicle.status ? <StatusChip status={vehicle.status} /> : null}
        meta={[
          vehicle.organisation.name,
          vehicle.vehicleCategory?.label,
          vehicle.isLegacyImport ? "from the legacy migration" : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      />

      {actionError ? (
        <ErrorNotice
          message={actionError.message}
          requestId={actionError.requestId}
        />
      ) : null}

      <StickerBanner
        vehicleId={vehicle.id}
        attached={vehicle.onboarding !== null}
        onAssign={goToSticker}
      />

      {holds("sticker.attach") && vehicle.onboarding === null ? (
        <StickerPromptDialog
          vehicleId={vehicle.id}
          plate={vehicle.plateNumberDisplay}
          open={justAdded && !promptClosed}
          onAssign={() => {
            setPromptClosed(true);
            // After the dialog has handed focus back.
            goToSticker();
          }}
          onLater={() => {
            setPromptClosed(true);
            openTab(tabInAddress as TabName);
          }}
        />
      ) : null}

      {isOnRecord ? (
        <Notice tone="info" title="On record, not declared">
          This vehicle is recorded with the Union but has not been declared. It
          counts for nothing outside the Union until it is declared and a
          sticker is attached.
        </Notice>
      ) : null}

      {isDisputed ? (
        <Notice tone="caution" title="Disputed">
          Another declaration for this plate is currently active. This record is
          preserved, not deleted, until the dispute is resolved.
        </Notice>
      ) : null}

      <Tabs
        id="record-tabs"
        tabIndex={-1}
        value={tab}
        onValueChange={(next) => openTab(next as TabName)}
        className="grid scroll-mt-20 gap-6 outline-none"
      >
        <TabsList aria-label="Parts of this vehicle's record">
          {tabs.map((entry) => (
            <TabsTrigger key={entry.value} value={entry.value}>
              {TAB_LABELS[entry.value]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="details" className="grid gap-6 outline-none">
          <Section title="Vehicle">
            <DetailList>
              <Detail label="Route type" value={vehicle.routeType?.label} />
              <Detail
                label="Vehicle type"
                value={vehicle.vehicleCategory?.label}
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
                      ? day(vehicle.declaredAt)
                      : "Not yet declared"
                  }
                />
              ) : null}
              {/* Requirement 9A.1 — onboarded is its own fact, beside declared. */}
              <Detail
                label="Onboarded"
                value={
                  vehicle.onboarding
                    ? `${day(vehicle.onboarding.attachedAt)} · sticker assigned${vehicle.onboarding.attachedBy ? ` · by ${vehicle.onboarding.attachedBy}` : ""}`
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
                  value={vehicle.chassisVinRestricted}
                />
              ) : null}
            </DetailList>
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
            <DetailList columns={3}>
              <Detail label="Name" value={vehicle.owner?.name} />
              <Detail label="Phone" value={vehicle.owner?.phone} />
              <Detail label="Address" value={vehicle.owner?.address} />
            </DetailList>
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
                  onChange={(event) =>
                    setDeclareRouteTypeId(event.target.value)
                  }
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
                  <Field
                    label="Owner's name"
                    htmlFor="declareOwnerName"
                    required
                  >
                    <TextInput
                      id="declareOwnerName"
                      value={declareOwnerName}
                      onChange={(event) =>
                        setDeclareOwnerName(event.target.value)
                      }
                    />
                  </Field>
                  <Field
                    label="Owner's phone"
                    htmlFor="declareOwnerPhone"
                    required
                  >
                    <TextInput
                      id="declareOwnerPhone"
                      inputMode="tel"
                      autoComplete="off"
                      value={declareOwnerPhone}
                      onChange={(event) =>
                        setDeclareOwnerPhone(event.target.value)
                      }
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
                    (ownerIncomplete &&
                      (!declareOwnerName || !declareOwnerPhone))
                  }
                  onClick={() =>
                    void act(
                      () =>
                        api.post(`/vehicles/${vehicle.id}/declare`, {
                          ...(declareRouteTypeId !==
                          (vehicle.routeType?.id ?? "")
                            ? { routeTypeId: declareRouteTypeId }
                            : {}),
                          ...(ownerIncomplete
                            ? {
                                owner: {
                                  name: declareOwnerName,
                                  phone: declareOwnerPhone,
                                  address:
                                    declareOwnerAddress.trim() || undefined,
                                },
                              }
                            : {}),
                        }),
                      "Vehicle declared",
                    )
                  }
                >
                  Declare this vehicle
                </Button>
              </div>
            </Section>
          ) : null}
        </TabsContent>

        {offersSticker ? (
          <TabsContent value="sticker" className="grid gap-6 outline-none">
            {holds("sticker.attach") ? (
              <OnboardingSection vehicle={vehicle} onChanged={() => mutate()} />
            ) : null}

            {vehicle.onboarding?.letterReference ? (
              <Section
                title="Vehicle letter"
                description="Produced when the vehicle was onboarded, and printed exactly as issued. It confirms the vehicle is recorded with the Union; it is not evidence of ownership, roadworthiness, licensing, or insurance. A reissued letter replaces it under a new reference."
              >
                <div className="flex flex-wrap items-end gap-4">
                  <dl>
                    <Detail
                      label="Reference"
                      value={vehicle.onboarding.letterReference}
                    />
                  </dl>
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
                  {holds("sticker.attach") ? (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setConfirming("REISSUE")}
                    >
                      Reissue letter
                    </Button>
                  ) : null}
                </div>
              </Section>
            ) : null}
          </TabsContent>
        ) : null}

        <TabsContent value="levy" className="grid gap-6 outline-none">
          <VehicleDuesPanel vehicleId={vehicle.id} />
        </TabsContent>

        {offersManage ? (
          <TabsContent value="manage" className="grid gap-6 outline-none">
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
                      busy ||
                      driverId === (vehicle.declaredByMember?.id ?? null)
                    }
                    onClick={() =>
                      void act(
                        () =>
                          api.patch(`/vehicles/${vehicle.id}`, {
                            declaredByMemberId: driverId,
                          }),
                        "Driver saved",
                      )
                    }
                  >
                    Save driver
                  </Button>
                </div>
              </Section>
            ) : null}

            {canDismiss ? (
              <Section
                title="Dispute"
                description="Dismisses this claim. Upholding a claim instead — which would demote whichever declaration currently holds ACTIVE for this plate — is not built; that decision is still open with the Union."
              >
                <div>
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => setConfirming("DISMISS")}
                  >
                    Dismiss this claim
                  </Button>
                </div>
              </Section>
            ) : null}

            {canChangeStatus ? (
              <Section
                title="Status"
                description="Each change asks for a reason, which is recorded in the audit trail."
              >
                <div className="flex flex-wrap gap-3">
                  {isSuspended ? (
                    <Button
                      type="button"
                      onClick={() => setConfirming("REACTIVATE")}
                    >
                      Reactivate
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setConfirming("SUSPEND")}
                    >
                      Suspend
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => setConfirming("RETIRE")}
                  >
                    Retire
                  </Button>
                </div>
              </Section>
            ) : null}
          </TabsContent>
        ) : null}
      </Tabs>

      {confirming ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setConfirming(null);
            }
          }}
          title={CONFIRM[confirming].title}
          description={<p>{CONFIRM[confirming].description}</p>}
          confirmLabel={CONFIRM[confirming].confirmLabel}
          tone={CONFIRM[confirming].tone}
          reason={{}}
          onConfirm={(reason) => confirmed(confirming, reason)}
        />
      ) : null}
    </div>
  );
}
