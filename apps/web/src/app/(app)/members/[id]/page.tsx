"use client";

import type { MemberRecord } from "@nurtw/contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

import { explained } from "@/components/api-access";
import { DedicatedAccountPanel } from "@/components/dedicated-account-panel";
import { MemberDuesPanel } from "@/components/dues-panel";
import {
  MemberCardPanel,
  MemberVehiclesPanel,
  memberVehiclesKey,
} from "@/components/member-panels";
import {
  GuarantorDetails,
  NextOfKinDetails,
} from "@/components/registration-people";
import {
  Button,
  Detail,
  DetailList,
  ErrorNotice,
  Loading,
  Notice,
  PageHeader,
  Section,
  StatusChip,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError, api, fetcher } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useTabParam } from "@/lib/use-tab-param";

/**
 * One member's record (item 37).
 *
 * Keyed by the member and not by an application, so a migrated member, who
 * has none, has a page. What it shows is what the API returned: the
 * application for somebody who reads applications, and contact, next of kin,
 * and guarantor for somebody who holds `member_sensitive.read`. A part that is
 * absent was never sent; nothing here hides one.
 *
 * The page is a record in tabs (`DESIGN.md` §10).
 */

const TAB_LABELS = {
  details: "Details",
  vehicles: "Vehicles",
  dues: "Dues",
  card: "Card",
  manage: "Manage",
} as const;
type TabName = keyof typeof TAB_LABELS;

/** A change of status, confirmed in a dialog. */
type Change = "SUSPEND" | "RESTORE" | "CANCEL";

const CHANGES: Record<
  Change,
  { status: "ACTIVE" | "SUSPENDED" | "CANCELLED"; done: string }
> = {
  SUSPEND: { status: "SUSPENDED", done: "Member suspended" },
  RESTORE: { status: "ACTIVE", done: "Member restored" },
  CANCEL: { status: "CANCELLED", done: "Membership cancelled" },
};

function place(person: {
  area: string | null;
  townCity: string | null;
}): string | null {
  const parts = [person.area, person.townCity].filter((part): part is string =>
    Boolean(part?.trim()),
  );
  return parts.length > 0 ? parts.join(", ") : null;
}

export default function MemberRecordPage() {
  const params = useParams<{ id: string }>();
  const { holds } = useSession();
  const [changing, setChanging] = useState<Change | null>(null);

  const { data, error, isLoading, mutate } = useSWR<{ member: MemberRecord }>(
    `/members/${params.id}`,
    fetcher,
  );
  const member = data?.member ?? null;
  const loadError = error instanceof ApiError ? error : null;

  // Counted for the tab's label. The panel reads the same address, so this is
  // one request, not two.
  const canSeeVehicles = holds("vehicle.read");
  const canAddVehicle = holds("vehicle.record") || holds("vehicle.declare");
  const { data: vehicleData } = useSWR<{ vehicles: unknown[] }>(
    member && canSeeVehicles ? memberVehiclesKey(member.id) : null,
    fetcher,
  );
  const vehicleCount = vehicleData?.vehicles.length ?? 0;

  const status = member?.status;
  const isMember = status !== undefined && status !== "PENDING";
  // Only an active member may hold a card.
  const offersCard = status === "ACTIVE" && holds("card.read");
  // A cancelled membership has nothing left to change, and a pending applicant
  // is refused on the application, not suspended here.
  const offersManage =
    holds("member.suspend") && (status === "ACTIVE" || status === "SUSPENDED");
  const tabs: { value: TabName }[] = [
    { value: "details" },
    ...(canSeeVehicles || canAddVehicle
      ? [{ value: "vehicles" as const }]
      : []),
    // Dues are internal (Requirement 27.8): for those who may read the member.
    ...(isMember ? [{ value: "dues" as const }] : []),
    ...(offersCard ? [{ value: "card" as const }] : []),
    ...(offersManage ? [{ value: "manage" as const }] : []),
  ];
  const [tab, setTab] = useTabParam(tabs);

  if (isLoading) {
    return <Loading label="Loading the member" />;
  }

  if (!member) {
    return (
      <div className="grid gap-4">
        <ErrorNotice
          message={
            loadError?.status === 404
              ? "No such member, or they are outside your area of responsibility."
              : (loadError?.message ?? "The member could not be loaded.")
          }
          requestId={loadError?.requestId}
        />
        <Link href="/members" className="text-sm underline underline-offset-2">
          Back to members
        </Link>
      </div>
    );
  }

  const name = [member.surname + ",", member.firstName, member.middleName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ");
  const application = member.application;
  const sensitive = member.sensitive;

  /** Does a confirmed change. A failure is thrown, and shown in its dialog. */
  async function change(which: Change, reason: string) {
    if (!member) {
      return;
    }
    try {
      await api.patch(`/members/${member.id}/status`, {
        status: CHANGES[which].status,
        reason,
      });
    } catch (caught) {
      throw explained(
        caught,
        "The member’s status has changed since this page was opened. Close this, reload the page, and try again.",
      );
    }
    toast.success(CHANGES[which].done);
    await mutate();
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader
        title={name}
        back={{ href: "/members", label: "Members" }}
        status={<StatusChip status={member.status} />}
        meta={
          <>
            {member.membershipNumber ? (
              <>
                Member{" "}
                <span className="font-mono">{member.membershipNumber}</span>{" "}
                ·{" "}
              </>
            ) : null}
            {member.organisation.name}
          </>
        }
      />

      {member.status === "PENDING" ? (
        <Notice
          tone="info"
          title="An applicant, not yet a member"
          action={
            application ? (
              <Link
                href={`/applications/${application.id}`}
                className="text-sm font-medium underline underline-offset-2"
              >
                Open the application
              </Link>
            ) : null
          }
        >
          The membership number is issued when the application is approved.
        </Notice>
      ) : null}
      {member.status === "SUSPENDED" ? (
        <Notice tone="caution" title="This member is suspended">
          A suspension can be lifted. The reason is in the audit trail.
        </Notice>
      ) : null}
      {member.status === "CANCELLED" ? (
        <Notice tone="deny" title="This membership is cancelled">
          A cancellation is final. The record and its number are kept, so the
          register can still say who was a member, and when.
        </Notice>
      ) : null}

      <Tabs value={tab} onValueChange={setTab} className="grid gap-6">
        <TabsList aria-label="Parts of this member’s record">
          {tabs.map((entry) => (
            <TabsTrigger key={entry.value} value={entry.value}>
              {TAB_LABELS[entry.value]}
              {entry.value === "vehicles" && vehicleCount > 0
                ? ` (${vehicleCount})`
                : ""}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="details" className="grid gap-6 outline-none">
          <Section title="Membership">
            <DetailList>
              <Detail label="Unit" value={member.organisation.name} />
              <Detail label="Designation" value={member.designation?.label} />
              <Detail
                label="Membership number"
                value={member.membershipNumber}
                missing="Not yet issued"
              />
              {/* Present only for an officer who reads applications. */}
              {application !== undefined ? (
                <Detail label="Application">
                  {application ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/applications/${application.id}`}
                        className="font-mono text-sm text-link underline-offset-2 hover:underline"
                      >
                        {application.applicationNumber}
                      </Link>
                      <StatusChip status={application.status} />
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      None. This record came from the legacy register.
                    </span>
                  )}
                </Detail>
              ) : null}
            </DetailList>
          </Section>

          {sensitive ? (
            <>
              <Section title="Contact">
                {sensitive.contact ? (
                  <DetailList>
                    <Detail label="Telephone" value={sensitive.contact.phone} />
                    <Detail
                      label="State of origin"
                      value={sensitive.contact.stateOfOrigin}
                    />
                    <Detail
                      label="Residential address"
                      value={sensitive.contact.residentialAddress}
                    />
                    <Detail
                      label="Area and town"
                      value={place(sensitive.contact)}
                    />
                    <Detail
                      label="Local government area"
                      value={sensitive.contact.lga?.name}
                    />
                  </DetailList>
                ) : (
                  <p className="text-sm text-faint-foreground">
                    No contact details are on this record.
                  </p>
                )}
              </Section>

              <Section title="Next of kin">
                <NextOfKinDetails person={sensitive.nextOfKin} />
              </Section>

              <Section title="Guarantor">
                <GuarantorDetails person={sensitive.guarantor} />
              </Section>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Contact, next-of-kin, and guarantor details are shown only to an
              officer who is permitted to read them.
            </p>
          )}
        </TabsContent>

        {canSeeVehicles || canAddVehicle ? (
          <TabsContent value="vehicles" className="grid gap-6 outline-none">
            <MemberVehiclesPanel
              memberId={member.id}
              // An applicant's vehicles are added in the registration flow; a
              // member with no application is picked on the vehicle's own form.
              addHref={
                application
                  ? `/applications/${application.id}/vehicles`
                  : "/vehicles/new"
              }
            />
          </TabsContent>
        ) : null}

        {isMember ? (
          <TabsContent value="dues" className="grid gap-6 outline-none">
            <MemberDuesPanel memberId={member.id} />
            {holds("payment.read") ? (
              <DedicatedAccountPanel memberId={member.id} />
            ) : null}
          </TabsContent>
        ) : null}

        {offersCard ? (
          <TabsContent value="card" className="grid gap-6 outline-none">
            <MemberCardPanel
              memberId={member.id}
              residentialAddress={sensitive?.contact?.residentialAddress}
            />
          </TabsContent>
        ) : null}

        {offersManage ? (
          <TabsContent value="manage" className="grid gap-6 outline-none">
            {member.status === "ACTIVE" ? (
              <Section
                title="Suspend"
                description="Stops this membership until it is restored. While it is suspended, a membership check does not verify this member."
              >
                <div>
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => setChanging("SUSPEND")}
                  >
                    Suspend this member
                  </Button>
                </div>
              </Section>
            ) : (
              <Section
                title="Restore"
                description="Lifts the suspension. The member is active again from that moment."
              >
                <div>
                  <Button type="button" onClick={() => setChanging("RESTORE")}>
                    Restore this member
                  </Button>
                </div>
              </Section>
            )}

            <Section
              title="Cancel the membership"
              description="Ends this membership for good. It cannot be restored: somebody who rejoins is registered again, under a new number."
            >
              <div>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => setChanging("CANCEL")}
                >
                  Cancel this membership
                </Button>
              </div>
            </Section>
          </TabsContent>
        ) : null}
      </Tabs>

      {changing === "SUSPEND" ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setChanging(null)}
          title="Suspend this member?"
          description={
            <p>
              {member.firstName} {member.surname} stops being an active member
              until somebody restores them. The reason is kept in the audit
              trail.
            </p>
          }
          confirmLabel="Suspend the member"
          reason={{}}
          onConfirm={(reason) => change("SUSPEND", reason)}
        />
      ) : null}
      {changing === "RESTORE" ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setChanging(null)}
          title="Restore this member?"
          description={
            <p>
              {member.firstName} {member.surname} becomes an active member
              again. The reason is kept in the audit trail.
            </p>
          }
          confirmLabel="Restore the member"
          tone="primary"
          reason={{}}
          onConfirm={(reason) => change("RESTORE", reason)}
        />
      ) : null}
      {changing === "CANCEL" ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setChanging(null)}
          title="Cancel this membership?"
          description={
            <p>
              {member.firstName} {member.surname} stops being a member, and{" "}
              <strong>this cannot be undone</strong>. The record and its number
              are kept. The reason is kept in the audit trail.
            </p>
          }
          confirmLabel="Cancel the membership"
          reason={{}}
          onConfirm={(reason) => change("CANCEL", reason)}
        />
      ) : null}
    </div>
  );
}
