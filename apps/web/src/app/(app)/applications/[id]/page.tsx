"use client";

import type { ApplicationDetail } from "@nurtw/contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

import { CorrectRegistration } from "@/components/correct-registration";
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
  PageHeader,
  Section,
  StatusChip,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  buttonVariants,
} from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { ninStatement } from "@/lib/nin";
import { useSession } from "@/lib/session";
import { useTabParam } from "@/lib/use-tab-param";

/**
 * One registration (item 61: a member is active the moment it is saved).
 *
 * This is the only screen that shows next-of-kin, guarantor, and contact detail,
 * matching the only endpoint that returns them (PRD Requirement 7.1). A wrong
 * detail is corrected here: an administrator at any time, and the officer who
 * registered the member once. The API decides; the button follows
 * `application.correction`.
 *
 * The page is a record in tabs (`DESIGN.md` §10).
 */

const TAB_LABELS = {
  application: "Application",
  vehicles: "Vehicles",
  dues: "Dues",
  card: "Card",
} as const;
type TabName = keyof typeof TAB_LABELS;

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const { holds } = useSession();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [correcting, setCorrecting] = useState(false);

  /**
   * The application.
   *
   * `mutate` refetches after a correction, so the screen reflects what the
   * server actually recorded rather than what the form assumed.
   */
  const { data, error, isLoading, mutate } = useSWR<{
    application: ApplicationDetail;
  }>(`/applications/${params.id}`, fetcher);

  const application = data?.application ?? null;
  const loadError = error instanceof ApiError ? error : null;

  /**
   * The member's vehicles (PRD Requirement 9.10, revision 1.3), recorded in the
   * registration flow.
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
  // Only an active member may hold a card.
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

  // The member's photograph (MEM-18), by the signed link the detail carries.
  // It is changed on the member's record (item 44), not here.
  const photograph =
    application.passportPhotoId && application.passportPhotoUrl
      ? { id: application.passportPhotoId, url: application.passportPhotoUrl }
      : null;

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader
        title={`${member.surname}, ${member.firstName} ${member.middleName ?? ""}`.trim()}
        back={{ href: "/applications", label: "Applications" }}
        status={<StatusChip status={member.status} />}
        meta={
          <>
            Registration{" "}
            <span className="font-mono">{application.applicationNumber}</span> ·{" "}
            {member.organisation.name}
          </>
        }
        actions={
          // The person has a record of their own (item 37).
          holds("member.read") ? (
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
                missing="Not issued"
              />
              <Detail
                label="Registered"
                value={new Date(application.registeredAt).toLocaleString("en-GB")}
              />
              <Detail
                label="Registered by"
                value={application.registeredBy}
                missing="Not recorded"
              />
            </DetailList>
          </Section>

          {application.correction !== "NONE" ? (
            <Section
              title="Correction"
              description={
                application.correction === "ONCE"
                  ? "You registered this member, so you have one correction. After it, only an administrator can change this registration."
                  : "A wrong detail can be corrected at any time. Each correction is recorded in the audit trail."
              }
            >
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setCorrecting(true)}
                >
                  Correct this registration
                </Button>
              </div>
            </Section>
          ) : null}

          <Section
            title="Photograph"
            description="The member’s photograph, as it is printed on their card. It is changed on the member’s record."
          >
            {photograph ? (
              // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived link to the API; next/image would cache and re-serve it.
              <img
                src={api.mediaUrl(photograph.url)}
                alt="The member’s photograph"
                className="h-32 w-26 rounded-md border border-line object-cover"
              />
            ) : (
              <p className="text-sm text-faint-foreground">
                No photograph was taken.
              </p>
            )}
          </Section>

          <Section title="Section A — Personal">
            <DetailList>
              <Detail label="Telephone" value={application.contact?.phone} />
              {/* Item 44: whether one is recorded, and its end. Never the NIN. */}
              <Detail label="NIN" value={ninStatement(application)} />
              <Detail
                label="State of origin"
                value={application.contact?.stateOfOrigin}
              />
              <Detail
                label="Residential address"
                value={application.contact?.residentialAddress}
              />
              <Detail
                label="Town / City"
                value={application.contact?.townCity}
              />
              <Detail
                label="Local government area"
                value={application.contact?.lga?.name}
              />
              {/* No longer asked for (MEM-17): shown where one was recorded. */}
              {application.contact?.area ? (
                <Detail label="Area" value={application.contact.area} />
              ) : null}
            </DetailList>
          </Section>

          <Section title="Section C — Next of Kin">
            <NextOfKinDetails person={application.nextOfKin} />
          </Section>

          <Section title="Section D — Guarantor">
            <GuarantorDetails person={application.guarantor} />
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

      {correcting ? (
        <CorrectRegistration
          application={application}
          onOpenChange={(open) => !open && setCorrecting(false)}
          onSaved={() => mutate()}
        />
      ) : null}
    </div>
  );
}
