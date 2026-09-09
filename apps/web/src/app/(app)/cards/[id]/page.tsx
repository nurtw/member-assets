"use client";

import type { CardDetail } from "@nurtw/contracts";
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
 * One card, and the acts available upon it.
 *
 * The controls offered follow the card's status and the officer's permissions.
 * Both are courtesy: the API's guard refuses regardless, and every service
 * method re-asks the permission question against the holder's own organisation.
 * Hiding a button only avoids offering one that would refuse.
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

export default function CardDetailPage() {
  const params = useParams<{ id: string }>();
  const { holds } = useSession();
  const [reason, setReason] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<ApiError | null>(null);

  const { data, error, isLoading, mutate } = useSWR<{ card: CardDetail }>(
    `/cards/${params.id}`,
    fetcher,
  );

  const card = data?.card ?? null;
  const loadError = error instanceof ApiError ? error : null;

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      setReason("");
      setAddress("");
      // Refetched rather than assumed: approval allocates a card number
      // server-side, and guessing at it here would be inventing data.
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

  if (!card) {
    return (
      <div className="grid gap-4">
        <ErrorNotice
          message={
            loadError?.status === 404
              ? "No such card, or it is outside your area of responsibility."
              : (loadError?.message ?? "The card could not be loaded.")
          }
          requestId={loadError?.requestId}
        />
        <Link href="/cards" className="text-sm underline underline-offset-2">
          Back to cards
        </Link>
      </div>
    );
  }

  const isDraft = card.status === "DRAFT";
  const awaitingApproval = card.status === "PENDING_APPROVAL";
  const awaitingCollection = card.status === "ISSUED";
  const isSuspended = card.status === "SUSPENDED";
  const isLive = card.status === "ISSUED" || card.status === "ACTIVE";
  const replaceable = [
    "ISSUED",
    "ACTIVE",
    "SUSPENDED",
    "LOST",
    "EXPIRED",
  ].includes(card.status);

  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <Link
          href="/cards"
          className="text-sm text-black/55 underline-offset-2 hover:underline"
        >
          ← Cards
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">
            {card.member.surname}, {card.member.firstName}
          </h1>
          <StatusChip status={card.status} />
        </div>
        <p className="mt-1 font-mono text-xs text-black/55">
          {card.cardNumber ? (
            `Card ${card.cardNumber}`
          ) : (
            <span className="font-sans italic text-black/45">
              No card number — allocated when the card is issued
            </span>
          )}
        </p>
      </div>

      {actionError ? (
        <ErrorNotice
          message={actionError.message}
          requestId={actionError.requestId}
        />
      ) : null}

      {/*
        The template warning. DESIGN.md §2 — the palette is reconstructed from a
        photograph and must be replaced with sampled values before anything is
        printed for a member. Stated on the screen where somebody would print,
        not only in a document.
      */}
      {card.templateVersion.includes("provisional") ? (
        <div className="rounded-md border border-[var(--verdict-caution)]/30 bg-[var(--verdict-caution-surface)] px-4 py-3">
          <p className="text-sm font-semibold text-[var(--verdict-caution)]">
            Provisional template
          </p>
          <p className="mt-1 text-sm">
            This design is reconstructed from a photograph of the Union’s card.
            Documents produced from it are for checking only and must not be
            printed and issued to a member until the Union supplies the official
            artwork.
          </p>
        </div>
      ) : null}

      <Section
        title="What is printed on this card"
        description="A snapshot taken when the card was issued. It does not change when the member record changes afterwards, because the card in the member’s pocket does not change either."
      >
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Name" value={card.printed.name} />
          <Detail label="Designation" value={card.printed.designation} />
          <Detail label="Address" value={card.printed.address} />
          <Detail label="State" value={card.printed.state} />
          <Detail label="Branch" value={card.printed.branch} />
          <Detail label="Unity Body" value={card.printed.unit} />
          <Detail
            label="Membership number"
            value={card.printed.membershipNumber}
          />
          <Detail label="Template" value={card.templateVersion} />
          <Detail
            label="Issued"
            value={
              card.issueDate
                ? new Date(card.issueDate).toLocaleDateString("en-GB")
                : null
            }
          />
          <Detail
            label="Expires"
            value={
              card.expiryDate
                ? new Date(card.expiryDate).toLocaleDateString("en-GB")
                : "No expiry set"
            }
          />
        </dl>

        <div className="flex flex-wrap gap-3 border-t border-[var(--border-subtle)] pt-4">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void act(() =>
                api.download(`/cards/${card.id}/document`, "nurtw-card.pdf"),
              )
            }
          >
            {card.cardNumber ? "Download card" : "Download proof"}
          </Button>
          {!card.cardNumber ? (
            <p className="self-center text-xs text-black/55">
              Overprinted <strong>PROOF — NOT ISSUED</strong> and carries no card
              number.
            </p>
          ) : null}
        </div>
      </Section>

      {(card.replacementOfCardId ?? card.replacedByCardId) ? (
        <Section
          title="Replacement history"
          description="History is preserved: a superseded card keeps its number and its relationship to the card that replaced it."
        >
          <div className="grid gap-3 text-sm">
            {card.replacementOfCardId ? (
              <p>
                This card replaces{" "}
                <Link
                  href={`/cards/${card.replacementOfCardId}`}
                  className="underline underline-offset-2"
                >
                  an earlier card
                </Link>
                .
              </p>
            ) : null}
            {card.replacedByCardId ? (
              <p>
                This card has been superseded by{" "}
                <Link
                  href={`/cards/${card.replacedByCardId}`}
                  className="underline underline-offset-2"
                >
                  a replacement
                </Link>
                .
              </p>
            ) : null}
          </div>
        </Section>
      ) : null}

      {isDraft && holds("card.issue") ? (
        <Section
          title="Send for approval"
          description="Once submitted the card can no longer be amended, because the approver must decide on what they were shown."
        >
          <div>
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(() => api.post(`/cards/${card.id}/submission`))
              }
            >
              Send for approval
            </Button>
          </div>
        </Section>
      ) : null}

      {awaitingApproval && holds("card.approve") ? (
        <Section
          title="Approval"
          description="Approving allocates the card number and stamps the issue date. Returning it for amendment requires a reason, which is recorded."
        >
          <Field label="Reason" htmlFor="reason" hint="Required to return the card.">
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
                  api.post(`/cards/${card.id}/decision`, {
                    decision: "ISSUED",
                    reason: reason.trim() || undefined,
                  }),
                )
              }
            >
              Approve and allocate card number
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || reason.trim().length < 4}
              onClick={() =>
                void act(() =>
                  api.post(`/cards/${card.id}/decision`, {
                    decision: "DRAFT",
                    reason: reason.trim(),
                  }),
                )
              }
            >
              Return for amendment
            </Button>
          </div>
        </Section>
      ) : null}

      {awaitingCollection && holds("card.issue") ? (
        <Section
          title="Collection"
          description="Record that the card has been handed to its holder. A card only verifies once it has been collected — until then it exists but has not been given to anybody."
        >
          <div>
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(() => api.post(`/cards/${card.id}/activation`))
              }
            >
              Record collection
            </Button>
          </div>
        </Section>
      ) : null}

      {holds("card.suspend") && (isLive || isSuspended) ? (
        <Section
          title="Status"
          description="A reason is required and is recorded in the audit trail. A card reported lost is never returned to active — it may be in somebody else’s hands — so a card found again is replaced rather than restored."
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
                    api.patch(`/cards/${card.id}/status`, {
                      status: "ACTIVE",
                      reason: reason.trim(),
                    }),
                  )
                }
              >
                Restore
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                disabled={busy || reason.trim().length < 4}
                onClick={() =>
                  void act(() =>
                    api.patch(`/cards/${card.id}/status`, {
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
              variant="secondary"
              disabled={busy || reason.trim().length < 4}
              onClick={() =>
                void act(() =>
                  api.patch(`/cards/${card.id}/status`, {
                    status: "LOST",
                    reason: reason.trim(),
                  }),
                )
              }
            >
              Report lost
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={busy || reason.trim().length < 4}
              onClick={() =>
                void act(() =>
                  api.patch(`/cards/${card.id}/status`, {
                    status: "CANCELLED",
                    reason: reason.trim(),
                  }),
                )
              }
            >
              Cancel
            </Button>
          </div>
        </Section>
      ) : null}

      {replaceable && holds("card.replace") ? (
        <Section
          title="Replace"
          description="The original is superseded and a new card is prepared, carrying the same printed values. The replacement still needs approval before it is issued."
        >
          <Field
            label="Address as printed"
            htmlFor="address"
            hint="Leave blank to carry the current address over."
          >
            <TextInput
              id="address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          </Field>
          <Field label="Reason" htmlFor="replaceReason">
            <TextArea
              id="replaceReason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <div>
            <Button
              type="button"
              disabled={busy || reason.trim().length < 4}
              onClick={() =>
                void act(() =>
                  api.post(`/cards/${card.id}/replacement`, {
                    reason: reason.trim(),
                    printedAddress: address.trim() || undefined,
                  }),
                )
              }
            >
              Replace this card
            </Button>
          </div>
        </Section>
      ) : null}
    </div>
  );
}
