"use client";

import type { ApplicationDetail, CardSummary } from "@nurtw/contracts";
import { suggestCardAddress } from "@nurtw/domain";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";

import {
  Button,
  ErrorNotice,
  Field,
  Section,
  StatusChip,
  TextArea,
  TextInput,
} from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { useSession } from "@/lib/session";

/**
 * One application, and the decision upon it.
 *
 * This is the only screen that shows next-of-kin, guarantor, and contact detail,
 * matching the only endpoint that returns them (PRD Requirement 7.1). The
 * decision controls are offered only to an officer holding `application.decide`
 * — and the API refuses regardless, so hiding them is courtesy rather than
 * control.
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

function record(source: Record<string, unknown> | null, key: string): string | null {
  const value = source?.[key];
  return typeof value === "string" ? value : null;
}

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const { holds } = useSession();
  const [reason, setReason] = useState("");
  /**
   * The card address, before the officer has touched it.
   *
   * `null` means "not yet edited", so the suggested value shows through. Once
   * the officer types — including clearing the field entirely — the state holds
   * a string and the suggestion no longer applies. That keeps the default out
   * of an effect, so nothing races the fetch and nothing overwrites what the
   * officer has typed when the data revalidates.
   */
  const [cardAddress, setCardAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<ApiError | null>(null);

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
  const loading = isLoading;

  /**
   * The member's cards.
   *
   * Keyed on the member, and not requested at all until the application has
   * loaded — SWR treats a null key as "nothing to fetch", which is how a
   * dependent request is expressed without an effect.
   */
  const memberId = application?.member.id ?? null;
  const { data: cardData, mutate: mutateCards } = useSWR<{
    cards: CardSummary[];
  }>(memberId ? `/cards?memberId=${memberId}` : null, fetcher);
  const cards = cardData?.cards ?? [];
  const liveCard = cards.find((card) =>
    ["DRAFT", "PENDING_APPROVAL", "ISSUED", "ACTIVE"].includes(card.status),
  );

  /**
   * What goes in the card-address field.
   *
   * Suggested from the residential address the officer is already looking at on
   * this screen — **not** fetched by the card module, which cannot reach
   * `member_contact` at all (Decision 10.1). The value travels to the API as an
   * ordinary field the officer has confirmed.
   */
  const suggestedAddress = suggestCardAddress(
    application?.contact?.residentialAddress,
  );
  const printedAddress = cardAddress ?? suggestedAddress;

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

  if (loading) {
    return <p className="text-sm text-black/50">Loading…</p>;
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

  const { member } = application;
  const isDraft = application.status === "DRAFT";
  const awaitingDecision =
    application.status === "SUBMITTED" || application.status === "UNDER_REVIEW";

  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <Link
          href="/applications"
          className="text-sm text-black/55 underline-offset-2 hover:underline"
        >
          ← Applications
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">
            {member.surname}, {member.firstName} {member.middleName ?? ""}
          </h1>
          <StatusChip status={application.status} />
          <StatusChip status={member.status} />
        </div>
        <p className="mt-1 font-mono text-xs text-black/55">
          Application {application.applicationNumber}
        </p>
      </div>

      {actionError ? (
        <ErrorNotice
          message={actionError.message}
          requestId={actionError.requestId}
        />
      ) : null}

      {application.status === "REJECTED" && application.rejectionReason ? (
        <div className="rounded-md border border-[var(--verdict-deny)]/30 bg-[var(--verdict-deny-surface)] px-4 py-3">
          <p className="text-sm font-semibold text-[var(--verdict-deny)]">
            Application refused
          </p>
          <p className="mt-1 text-sm">{application.rejectionReason}</p>
        </div>
      ) : null}

      <Section title="Membership">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Unit" value={member.organisation.name} />
          <Detail
            label="Designation"
            value={member.designation?.label ?? null}
          />
          <Detail
            label="Membership number"
            value={member.membershipNumber ?? null}
          />
          <Detail
            label="Submitted"
            value={
              application.submittedAt
                ? new Date(application.submittedAt).toLocaleString("en-GB")
                : null
            }
          />
        </dl>
      </Section>

      <Section title="Section A — Personal">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Telephone" value={application.contact?.phone ?? null} />
          <Detail
            label="State of origin"
            value={application.contact?.stateOfOrigin ?? null}
          />
          <Detail
            label="Residential address"
            value={application.contact?.residentialAddress ?? null}
          />
          <Detail
            label="Local government area"
            value={application.contact?.lga?.name ?? null}
          />
        </dl>
      </Section>

      <Section title="Section C — Next of Kin">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail
            label="Name"
            value={
              application.nextOfKin
                ? `${record(application.nextOfKin, "surname") ?? ""}, ${
                    record(application.nextOfKin, "firstName") ?? ""
                  }`
                : null
            }
          />
          <Detail label="Telephone" value={record(application.nextOfKin, "phone")} />
          <Detail label="Address" value={record(application.nextOfKin, "address")} />
          <Detail
            label="Occupation"
            value={record(application.nextOfKin, "occupation")}
          />
        </dl>
      </Section>

      <Section title="Section D — Guarantor">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail
            label="Name"
            value={
              application.guarantor
                ? `${record(application.guarantor, "surname") ?? ""}, ${
                    record(application.guarantor, "firstName") ?? ""
                  }`
                : null
            }
          />
          <Detail
            label="Relationship to applicant"
            value={record(application.guarantor, "relationshipToApplicant")}
          />
          <Detail label="Telephone" value={record(application.guarantor, "phone")} />
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
        </dl>
      </Section>

      {/*
        The print-ready form for wet signature (PRD §23.16).

        Offered only to an officer holding `member_sensitive.read`, because the
        document carries next of kin, guarantor, telephone, and address — seeing
        that an application exists does not entitle somebody to print all of it.
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

      {/*
        Cards. Only an active member may hold one, so this appears once the
        application has been approved.
      */}
      {member.status === "ACTIVE" && holds("card.read") ? (
        <Section
          title="Membership card"
          description="A member holds one card at a time. A replacement supersedes the original rather than overwriting it."
        >
          {cards.length > 0 ? (
            <ul className="grid gap-2">
              {cards.map((card) => (
                <li
                  key={card.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--border-subtle)] px-3 py-2"
                >
                  <StatusChip status={card.status} />
                  <span className="font-mono text-xs text-black/70">
                    {card.cardNumber ?? (
                      <span className="font-sans italic text-black/40">
                        Not yet issued
                      </span>
                    )}
                  </span>
                  <Link
                    href={`/cards/${card.id}`}
                    className="ml-auto text-sm underline underline-offset-2"
                  >
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-black/55">No card has been prepared.</p>
          )}

          {!liveCard && holds("card.issue") ? (
            <div className="grid gap-4 border-t border-[var(--border-subtle)] pt-4">
              <Field
                label="Address as printed on the card"
                htmlFor="cardAddress"
                hint="Suggested from the residential address, shortened to fit the card. Amend it if the Union prints something different."
                required
              >
                <TextInput
                  id="cardAddress"
                  value={printedAddress}
                  onChange={(event) => setCardAddress(event.target.value)}
                />
              </Field>
              <div>
                <Button
                  type="button"
                  disabled={busy || printedAddress.trim().length < 4}
                  onClick={() =>
                    void act(async () => {
                      await api.post("/cards", {
                        memberId: member.id,
                        printedAddress: printedAddress.trim(),
                      });
                      setCardAddress(null);
                      await mutateCards();
                    })
                  }
                >
                  Prepare a card
                </Button>
              </div>
            </div>
          ) : null}
        </Section>
      ) : null}

      {isDraft && holds("member.create") ? (
        <Section
          title="Submit for review"
          description="Once submitted the application can no longer be amended, because the reviewer must decide on what they were shown."
        >
          <div>
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(() =>
                  api.post(`/applications/${application.id}/submission`),
                )
              }
            >
              Submit for review
            </Button>
          </div>
        </Section>
      ) : null}

      {awaitingDecision && holds("application.decide") ? (
        <Section
          title="Decision"
          description="A refusal requires a reason. It is recorded against the application and in the audit trail."
        >
          <Field label="Reason" htmlFor="reason" hint="Required to refuse.">
            <TextArea
              id="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(() =>
                  api.post(`/applications/${application.id}/decision`, {
                    decision: "APPROVED",
                    reason: reason.trim() || undefined,
                  }),
                )
              }
            >
              Approve and issue membership number
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={busy || reason.trim().length < 4}
              onClick={() =>
                void act(() =>
                  api.post(`/applications/${application.id}/decision`, {
                    decision: "REJECTED",
                    reason: reason.trim(),
                  }),
                )
              }
            >
              Refuse
            </Button>
          </div>
        </Section>
      ) : null}
    </div>
  );
}
