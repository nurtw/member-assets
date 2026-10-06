"use client";

import type { ApplicationDetail } from "@nurtw/contracts";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";

import { StickerPromptDialog } from "@/components/sticker-prompt";
import {
  Button,
  ErrorNotice,
  Loading,
  PageHeader,
  StatusChip,
} from "@/components/ui";
import { VehicleForm, type SavedVehicle } from "@/components/vehicle-form";
import { ApiError, fetcher } from "@/lib/api";
import { useSession } from "@/lib/session";

/**
 * The registration flow's second step: the applicant's vehicle
 * (PRD Requirement 9.10, revision 1.3, `QUESTIONS.md` VEH-24).
 *
 * Reached straight after an application is saved. The member is fixed — the
 * applicant just registered — and may still be pending approval. The officer
 * records one vehicle, several, or none: a member need not drive (leaders, for
 * example), so skipping is a normal outcome, not an abandoned form.
 *
 * Recording is used whenever the officer holds `vehicle.record`, even for a
 * declarer: registration captures; declaring is a separate, deliberate act
 * taken from the vehicle's own page (Decision 6.6).
 */
export default function ApplicantVehiclesPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { holds } = useSession();
  const [saved, setSaved] = useState<SavedVehicle[]>([]);
  // Item 35 (VEH-30): finishing ends on a prompt to assign the sticker.
  const [justSaved, setJustSaved] = useState<SavedVehicle | null>(null);

  const { data, error, isLoading } = useSWR<{ application: ApplicationDetail }>(
    `/applications/${params.id}`,
    fetcher,
  );
  const application = data?.application ?? null;
  const loadError = error instanceof ApiError ? error : null;

  const mode = holds("vehicle.record") ? "record" : "declare";
  const applicationHref = `/applications/${params.id}`;

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
        <Link href="/applications" className="text-sm underline underline-offset-2">
          Back to applications
        </Link>
      </div>
    );
  }

  const member = application.member;
  const memberLabel = `${member.surname}, ${member.firstName}`;
  // A member sits at a unit or branch; offer that as the vehicle's default.
  const defaultOrganisationId =
    member.organisation.level === "UNIT" || member.organisation.level === "BRANCH"
      ? member.organisation.id
      : undefined;

  return (
    <div className="grid max-w-2xl gap-6">
      <PageHeader
        title={`Add a vehicle for ${memberLabel}`}
        back={{ href: applicationHref, label: "The application" }}
        meta="Registration · Step 2 of 2"
        description={`Application ${application.applicationNumber} is saved${
          member.status === "PENDING" ? " and awaiting approval" : ""
        }. Add the vehicle this member drives, or skip this step if they have none. A vehicle added here goes on record; it is declared separately.`}
      />

      {saved.length > 0 ? (
        <div className="rounded-md border border-line bg-surface px-4 py-3">
          <p className="text-sm font-semibold">Added so far</p>
          <ul className="mt-2 grid gap-1.5">
            {saved.map((vehicle) => (
              <li key={vehicle.id} className="flex items-center gap-3 text-sm">
                <span className="font-mono">{vehicle.plateNumberDisplay}</span>
                {vehicle.status ? <StatusChip status={vehicle.status} /> : null}
                {holds("sticker.attach") ? (
                  <Link
                    href={`/vehicles/${vehicle.id}?assign=1`}
                    className="ml-auto font-medium text-link underline-offset-2 hover:underline"
                  >
                    Assign sticker
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <VehicleForm
        mode={mode}
        fixedMember={{ id: member.id, label: memberLabel }}
        defaultOrganisationId={defaultOrganisationId}
        offerAddAnother
        onSaved={(vehicle, addAnother) => {
          if (addAnother) {
            // The form clears itself for the next vehicle, keeping the branch
            // and route type; the list above keeps what has been added.
            setSaved((current) => [...current, vehicle]);
            return;
          }
          if (holds("sticker.attach")) {
            setJustSaved(vehicle);
            return;
          }
          router.push(applicationHref);
        }}
        extraActions={
          <Link href={applicationHref}>
            <Button type="button" variant="secondary">
              {saved.length > 0 ? "Finish" : "Skip — no vehicle"}
            </Button>
          </Link>
        }
      />

      {justSaved ? (
        <StickerPromptDialog
          vehicleId={justSaved.id}
          plate={justSaved.plateNumberDisplay}
          open
          onAssign={() => router.push(`/vehicles/${justSaved.id}?assign=1`)}
          onLater={() => router.push(applicationHref)}
        />
      ) : null}
    </div>
  );
}
