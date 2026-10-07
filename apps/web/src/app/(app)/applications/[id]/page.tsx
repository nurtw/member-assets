"use client";

import type { ApplicationDetail } from "@nurtw/contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

import { DedicatedAccountPanel } from "@/components/dedicated-account-panel";
import { MemberDuesPanel } from "@/components/dues-panel";
import {
  MemberCardPanel,
  MemberVehiclesPanel,
  memberVehiclesKey,
} from "@/components/member-panels";
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
  buttonVariants,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError, api, fetcher } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useTabParam } from "@/lib/use-tab-param";

/**
 * One application, and the decision upon it.
 *
 * This is the only screen that shows next-of-kin, guarantor, and contact detail,
 * matching the only endpoint that returns them (PRD Requirement 7.1). The
 * decision controls are offered only to an officer holding `application.decide`
 * — and the API refuses regardless, so hiding them is courtesy rather than
 * control.
 *
 * The page is a record in tabs (`DESIGN.md` §10). What the application is
 * waiting for sits above the tabs, so a decision is never a scroll away.
 */

const TAB_LABELS = {
  application: "Application",
  vehicles: "Vehicles",
  dues: "Dues",
  card: "Card",
} as const;
type TabName = keyof typeof TAB_LABELS;

/** An act confirmed in a dialog. */
type Confirming = "SUBMIT" | "APPROVE" | "REFUSE";

function record(
  source: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = source?.[key];
  return typeof value === "string" ? value : null;
}

function fullName(source: Record<string, unknown> | null): string | null {
  return source
    ? `${record(source, "surname") ?? ""}, ${record(source, "firstName") ?? ""}`
    : null;
}

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const { holds } = useSession();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [confirming, setConfirming] = useState<Confirming | null>(null);

  /**
   * The application.
   *
   * `mutate` refetches after a decision, so the screen reflects what the server
   * actually recorded rather than what the button assumed. An approval allocates
   * a membership number server-side; guessing at it here would be inventing data.
   */
  const { data, error, isLoading, mutate } = useSWR<{
    application: ApplicationDetail;
  }>(`/applications/${params.id}`, fetcher);

  const application = data?.application ?? null;
  const loadError = error instanceof ApiError ? error : null;

  /**
   * The applicant's vehicles (PRD Requirement 9.10, revision 1.3). Recorded in
   * the registration flow, possibly while the application is still pending,
   * so the reviewing officer can see them before deciding.
   *
   * Counted here for the tab's label. The panel reads the same address, so
   * this is one request, and it is not made until the application has loaded:
   * SWR treats a null key as "nothing to fetch".
   */
  const memberId = application?.member.id ?? null;
  const canSeeVehicles = holds("vehicle.read");
  const canAddVehicle = holds("vehicle.record") || holds("vehicle.declare");
  const { data: vehicleData } = useSWR<{ vehicles: unknown[] }>(
    memberId && canSeeVehicles ? memberVehiclesKey(memberId) : null,
    fetcher,
  );
  const vehicleCount = vehicleData?.vehicles.length ?? 0;

  // A tab is offered only where it has something for this officer.
  const offersVehicles = canSeeVehicles || canAddVehicle;
  // Dues are internal (Requirement 27.8): shown to those who may read members.
  const offersDues = holds("member.read") || holds("payment.read");
  // Only an active member may hold a card, so this appears once the
  // application has been approved.
  const offersCard =
    application?.member.status === "ACTIVE" && holds("card.read");
  const tabs: { value: TabName }[] = [
    { value: "application" },
    ...(offersVehicles ? [{ value: "vehicles" as const }] : []),
    ...(offersDues ? [{ value: "dues" as const }] : []),
    ...(offersCard ? [{ value: "card" as const }] : []),
  ];
  const [tab, setTab] = useTabParam(tabs);

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
    return <Loading label="Loading the application" />;
  }

  if (!application) {
    return (
      <div className="grid gap-4">
        <ErrorNotice
          message={
            loadError?.status === 404
              ? "No such application, or it is outside your area of responsibility."
              : (loadError?.message ?? "The application could not be loaded.")
          }
          requestId={loadError?.requestId}
        />
        <Link
          href="/applications"
          className="text-sm underline underline-offset-2"
        >
          Back to applications
        </Link>
      </div>
    );
  }

  const { member } = application;
  const isDraft = application.status === "DRAFT";
  const awaitingDecision =
    application.status === "SUBMITTED" || application.status === "UNDER_REVIEW";
  const canSubmit = isDraft && holds("member.create");
  const canDecide = awaitingDecision && holds("application.decide");

  /** Does a confirmed act. A failure is thrown, and shown in its dialog. */
  async function confirmed(which: Confirming, reason: string) {
    if (!application) {
      return;
    }
    if (which === "SUBMIT") {
      await api.post(`/applications/${application.id}/submission`);
      toast.success("Submitted for review");
    } else {
      await api.post(`/applications/${application.id}/decision`, {
        decision: which === "APPROVE" ? "APPROVED" : "REJECTED",
        reason: reason || undefined,
      });
      toast.success(
        which === "APPROVE"
          ? "Approved: the membership number is issued"
          : "Application refused",
      );
    }
    await mutate();
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader
        title={`${member.surname}, ${member.firstName} ${member.middleName ?? ""}`.trim()}
        back={{ href: "/applications", label: "Applications" }}
        status={
          <>
            <StatusChip status={application.status} />
            <StatusChip status={member.status} />
          </>
        }
        meta={
          <>
            Application{" "}
            <span className="font-mono">{application.applicationNumber}</span> ·{" "}
            {member.organisation.name}
          </>
        }
        actions={
          // Once approved, the person has a record of their own (item 37).
          member.status !== "PENDING" && holds("member.read") ? (
            <Link
              href={`/members/${member.id}`}
              className={buttonVariants({ variant: "secondary" })}
            >
              Member’s record
            </Link>
          ) : null
        }
      />

      {actionError ? (
        <ErrorNotice
          message={actionError.message}
          requestId={actionError.requestId}
        />
      ) : null}

      {application.status === "REJECTED" && application.rejectionReason ? (
        <Notice tone="deny" title="Application refused">
          {application.rejectionReason}
        </Notice>
      ) : null}

      {canSubmit ? (
        <Notice
          tone="info"
          title="Draft: not yet submitted"
          action={
            <Button type="button" onClick={() => setConfirming("SUBMIT")}>
              Submit for review
            </Button>
          }
        >
          Once submitted the application can no longer be amended, because the
          reviewer must decide on what they were shown.
        </Notice>
      ) : null}

      {canDecide ? (
        <Notice
          tone="caution"
          title="Waiting for a decision"
          action={
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => setConfirming("APPROVE")}>
                Approve
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => setConfirming("REFUSE")}
              >
                Refuse
              </Button>
            </div>
          }
        >
          Approving issues the membership number. A refusal requires a reason,
          recorded against the application and in the audit trail.
        </Notice>
      ) : null}

      <Tabs value={tab} onValueChange={setTab} className="grid gap-6">
        <TabsList aria-label="Parts of this application">
          {tabs.map((entry) => (
            <TabsTrigger key={entry.value} value={entry.value}>
              {TAB_LABELS[entry.value]}
              {entry.value === "vehicles" && vehicleCount > 0
                ? ` (${vehicleCount})`
                : ""}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="application" className="grid gap-6 outline-none">
          <Section title="Membership">
            <DetailList>
              <Detail label="Unit" value={member.organisation.name} />
              <Detail label="Designation" value={member.designation?.label} />
              <Detail
                label="Membership number"
                value={member.membershipNumber}
                missing="Not yet issued"
              />
              <Detail
                label="Submitted"
                value={
                  application.submittedAt
                    ? new Date(application.submittedAt).toLocaleString("en-GB")
                    : null
                }
                missing="Not yet submitted"
              />
            </DetailList>
          </Section>

          <Section title="Section A — Personal">
            <DetailList>
              <Detail label="Telephone" value={application.contact?.phone} />
              <Detail
                label="State of origin"
                value={application.contact?.stateOfOrigin}
              />
              <Detail
                label="Residential address"
                value={application.contact?.residentialAddress}
              />
              <Detail
                label="Local government area"
                value={application.contact?.lga?.name}
              />
            </DetailList>
          </Section>

          <Section title="Section C — Next of Kin">
            <DetailList>
              <Detail label="Name" value={fullName(application.nextOfKin)} />
              <Detail
                label="Telephone"
                value={record(application.nextOfKin, "phone")}
              />
              <Detail
                label="Address"
                value={record(application.nextOfKin, "address")}
              />
              <Detail
                label="Occupation"
                value={record(application.nextOfKin, "occupation")}
              />
            </DetailList>
          </Section>

          <Section title="Section D — Guarantor">
            <DetailList>
              <Detail label="Name" value={fullName(application.guarantor)} />
              <Detail
                label="Relationship to applicant"
                value={record(application.guarantor, "relationshipToApplicant")}
              />
              <Detail
                label="Telephone"
                value={record(application.guarantor, "phone")}
              />
              <Detail
                label="Collateral offered"
                value={
                  application.guarantor?.hasCollateral === true
                    ? "Yes"
                    : application.guarantor?.hasCollateral === false
                      ? "No"
                      : null
                }
              />
              {application.guarantor?.hasCollateral === true ? (
                <div className="sm:col-span-2">
                  <Detail
                    label="Collateral details"
                    value={record(application.guarantor, "collateralDetails")}
                  />
                </div>
              ) : null}
            </DetailList>
          </Section>

          {/*
            The print-ready form for wet signature (PRD §23.16).

            Offered only to an officer holding `member_sensitive.read`, because
            the document carries next of kin, guarantor, telephone, and address
            — seeing that an application exists does not entitle somebody to
            print all of it.
          */}
          {holds("member_sensitive.read") ? (
            <Section
              title="Registration form"
              description="The Union’s form, filled in from this record, for physical signature."
            >
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void act(() =>
                      api.download(
                        `/applications/${application.id}/form`,
                        "nurtw-registration.pdf",
                      ),
                    )
                  }
                >
                  Download form for signature
                </Button>
              </div>
            </Section>
          ) : null}
        </TabsContent>

        {offersVehicles ? (
          <TabsContent value="vehicles" className="grid gap-6 outline-none">
            <MemberVehiclesPanel
              memberId={member.id}
              addHref={`/applications/${application.id}/vehicles`}
            />
          </TabsContent>
        ) : null}

        {offersDues ? (
          <TabsContent value="dues" className="grid gap-6 outline-none">
            {holds("member.read") ? (
              <MemberDuesPanel memberId={member.id} />
            ) : null}
            {holds("payment.read") ? (
              <DedicatedAccountPanel memberId={member.id} />
            ) : null}
          </TabsContent>
        ) : null}

        {offersCard ? (
          <TabsContent value="card" className="grid gap-6 outline-none">
            {/*
              The card address is suggested from the residential address the
              officer is already looking at on this screen. It is not fetched
              by the card module, which cannot reach `member_contact` at all
              (Decision 10.1).
            */}
            <MemberCardPanel
              memberId={member.id}
              residentialAddress={application.contact?.residentialAddress}
            />
          </TabsContent>
        ) : null}
      </Tabs>

      {confirming === "SUBMIT" ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setConfirming(null)}
          title="Submit for review?"
          description={
            <p>
              Once submitted the application can no longer be amended, because
              the reviewer must decide on what they were shown.
            </p>
          }
          confirmLabel="Submit for review"
          tone="primary"
          onConfirm={(reason) => confirmed("SUBMIT", reason)}
        />
      ) : null}
      {confirming === "APPROVE" ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setConfirming(null)}
          title="Approve this application?"
          description={
            <p>
              {member.firstName} {member.surname} becomes a member, and a
              membership number is issued. This cannot be undone from this
              screen.
            </p>
          }
          confirmLabel="Approve and issue membership number"
          tone="primary"
          reason={{ optional: true }}
          onConfirm={(reason) => confirmed("APPROVE", reason)}
        />
      ) : null}
      {confirming === "REFUSE" ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setConfirming(null)}
          title="Refuse this application?"
          description={
            <p>
              {member.firstName} {member.surname} is not made a member. The
              reason is recorded against the application, shown on this page,
              and kept in the audit trail.
            </p>
          }
          confirmLabel="Refuse the application"
          reason={{}}
          onConfirm={(reason) => confirmed("REFUSE", reason)}
        />
      ) : null}
    </div>
  );
}
