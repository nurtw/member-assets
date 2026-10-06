"use client";

import type { CardDetail } from "@nurtw/contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

import { MemberDuesPanel } from "@/components/dues-panel";
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
 * One card, and the acts available upon it.
 *
 * The controls offered follow the card's status and the officer's permissions.
 * Both are courtesy: the API's guard refuses regardless, and every service
 * method re-asks the permission question against the holder's own organisation.
 * Hiding a button only avoids offering one that would refuse.
 *
 * The page is a record in tabs (`DESIGN.md` §10). What the card is waiting
 * for sits above the tabs.
 */

const TAB_LABELS = { card: "Card", dues: "Dues", manage: "Manage" } as const;
type TabName = keyof typeof TAB_LABELS;

/** An act confirmed in a dialog. */
type Confirming =
  | "SUBMIT"
  | "APPROVE"
  | "RETURN"
  | "COLLECT"
  | "SUSPEND"
  | "RESTORE"
  | "LOST"
  | "CANCEL"
  | "REPLACE";

const CONFIRM: Record<
  Confirming,
  {
    title: string;
    description: string;
    confirmLabel: string;
    tone: "danger" | "primary";
    /** `none`: no reason asked. `optional`: a note may be given. */
    reason: "required" | "optional" | "none";
    done: string;
  }
> = {
  SUBMIT: {
    title: "Send this card for approval?",
    description:
      "Once sent the card can no longer be amended, because the approver must decide on what they were shown.",
    confirmLabel: "Send for approval",
    tone: "primary",
    reason: "none",
    done: "Sent for approval",
  },
  APPROVE: {
    title: "Approve this card?",
    description:
      "Approving allocates the card number and stamps the issue date. The card can then be printed and handed over.",
    confirmLabel: "Approve and allocate card number",
    tone: "primary",
    reason: "optional",
    done: "Approved: the card number is allocated",
  },
  RETURN: {
    title: "Return this card for amendment?",
    description:
      "The card goes back to a draft for whoever prepared it. The reason is recorded.",
    confirmLabel: "Return for amendment",
    tone: "primary",
    reason: "required",
    done: "Returned for amendment",
  },
  COLLECT: {
    title: "Record that the card was collected?",
    description:
      "This says the card has been handed to its holder. A card only verifies once it has been collected.",
    confirmLabel: "Record collection",
    tone: "primary",
    reason: "none",
    done: "Collection recorded",
  },
  SUSPEND: {
    title: "Suspend this card?",
    description:
      "The card stops verifying until an officer restores it. Its holder keeps it.",
    confirmLabel: "Suspend",
    tone: "primary",
    reason: "required",
    done: "Card suspended",
  },
  RESTORE: {
    title: "Restore this card?",
    description: "The card verifies again.",
    confirmLabel: "Restore",
    tone: "primary",
    reason: "required",
    done: "Card restored",
  },
  LOST: {
    title: "Report this card lost?",
    description:
      "The card stops verifying for good. A card reported lost is never returned to active, because it may be in somebody else’s hands. If it is found, it is replaced rather than restored.",
    confirmLabel: "Report lost",
    tone: "danger",
    reason: "required",
    done: "Card reported lost",
  },
  CANCEL: {
    title: "Cancel this card?",
    description:
      "The card is cancelled for good and stops verifying. Its record and number are kept.",
    confirmLabel: "Cancel the card",
    tone: "danger",
    reason: "required",
    done: "Card cancelled",
  },
  REPLACE: {
    title: "Replace this card?",
    description:
      "This card is superseded and a new one is prepared, carrying the same printed values. The replacement still needs approval before it is issued.",
    confirmLabel: "Replace this card",
    tone: "primary",
    reason: "required",
    done: "Replacement prepared",
  },
};

const STATUS_FOR: Partial<Record<Confirming, string>> = {
  SUSPEND: "SUSPENDED",
  RESTORE: "ACTIVE",
  LOST: "LOST",
  CANCEL: "CANCELLED",
};

function day(value: string): string {
  return new Date(value).toLocaleDateString("en-GB");
}

export default function CardDetailPage() {
  const params = useParams<{ id: string }>();
  const { holds } = useSession();
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [confirming, setConfirming] = useState<Confirming | null>(null);

  const { data, error, isLoading, mutate } = useSWR<{ card: CardDetail }>(
    `/cards/${params.id}`,
    fetcher,
  );

  const card = data?.card ?? null;
  const loadError = error instanceof ApiError ? error : null;

  const isDraft = card?.status === "DRAFT";
  const awaitingApproval = card?.status === "PENDING_APPROVAL";
  const awaitingCollection = card?.status === "ISSUED";
  const isSuspended = card?.status === "SUSPENDED";
  const isLive = card?.status === "ISSUED" || card?.status === "ACTIVE";
  const replaceable =
    card !== null &&
    ["ISSUED", "ACTIVE", "SUSPENDED", "LOST", "EXPIRED"].includes(card.status);
  const canChangeStatus = holds("card.suspend") && (isLive || isSuspended);
  const canReplace = replaceable && holds("card.replace");

  // A tab is offered only where it has something for this officer.
  const tabs: { value: TabName }[] = [
    { value: "card" },
    // PAY-05 — dues do not block a card. The officer preparing, approving, or
    // renewing it sees the member's fee status and decides.
    ...(holds("member.read") ? [{ value: "dues" as const }] : []),
    ...(canChangeStatus || canReplace ? [{ value: "manage" as const }] : []),
  ];
  const [tab, setTab] = useTabParam(tabs);

  async function download() {
    if (!card) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await api.download(`/cards/${card.id}/document`, "nurtw-card.pdf");
    } catch (caught) {
      if (caught instanceof ApiError) {
        setActionError(caught);
      }
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return <Loading label="Loading the card" />;
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

  /** Does a confirmed act. A failure is thrown, and shown in its dialog. */
  async function confirmed(which: Confirming, reason: string) {
    if (!card) {
      return;
    }
    const status = STATUS_FOR[which];
    if (status) {
      await api.patch(`/cards/${card.id}/status`, { status, reason });
    } else if (which === "SUBMIT") {
      await api.post(`/cards/${card.id}/submission`);
    } else if (which === "COLLECT") {
      await api.post(`/cards/${card.id}/activation`);
    } else if (which === "REPLACE") {
      await api.post(`/cards/${card.id}/replacement`, {
        reason,
        printedAddress: address.trim() || undefined,
      });
      setAddress("");
    } else {
      await api.post(`/cards/${card.id}/decision`, {
        decision: which === "APPROVE" ? "ISSUED" : "DRAFT",
        reason: reason || undefined,
      });
    }
    toast.success(CONFIRM[which].done);
    // Refetched rather than assumed: approval allocates a card number
    // server-side, and guessing at it here would be inventing data.
    await mutate();
  }

  const asked = confirming ? CONFIRM[confirming] : null;

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader
        title={`${card.member.surname}, ${card.member.firstName}`}
        back={{ href: "/cards", label: "Cards" }}
        status={<StatusChip status={card.status} />}
        meta={
          card.cardNumber ? (
            <>
              Card <span className="font-mono">{card.cardNumber}</span>
            </>
          ) : (
            <span className="italic">
              No card number: allocated when the card is issued
            </span>
          )
        }
      />

      {actionError ? (
        <ErrorNotice
          message={actionError.message}
          requestId={actionError.requestId}
        />
      ) : null}

      {isDraft && holds("card.issue") ? (
        <Notice
          tone="info"
          title="Draft: not yet sent for approval"
          action={
            <Button type="button" onClick={() => setConfirming("SUBMIT")}>
              Send for approval
            </Button>
          }
        >
          Once sent the card can no longer be amended, because the approver must
          decide on what they were shown.
        </Notice>
      ) : null}

      {awaitingApproval && holds("card.approve") ? (
        <Notice
          tone="caution"
          title="Waiting for approval"
          action={
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => setConfirming("APPROVE")}>
                Approve
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setConfirming("RETURN")}
              >
                Return for amendment
              </Button>
            </div>
          }
        >
          Approving allocates the card number and stamps the issue date.
          Returning it for amendment requires a reason, which is recorded.
        </Notice>
      ) : null}

      {awaitingCollection && holds("card.issue") ? (
        <Notice
          tone="info"
          title="Issued: waiting to be collected"
          action={
            <Button type="button" onClick={() => setConfirming("COLLECT")}>
              Record collection
            </Button>
          }
        >
          A card only verifies once it has been collected. Until then it exists
          but has not been given to anybody.
        </Notice>
      ) : null}

      <Tabs value={tab} onValueChange={setTab} className="grid gap-6">
        <TabsList aria-label="Parts of this card's record">
          {tabs.map((entry) => (
            <TabsTrigger key={entry.value} value={entry.value}>
              {TAB_LABELS[entry.value]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="card" className="grid gap-6 outline-none">
          {/*
            The template warning. DESIGN.md §2 — the palette is reconstructed
            from a photograph and must be replaced with sampled values before
            anything is printed for a member. Stated on the screen where
            somebody would print, not only in a document.
          */}
          {card.templateVersion.includes("provisional") ? (
            <Notice tone="caution" title="Provisional template">
              This design is reconstructed from a photograph of the Union’s
              card. Documents produced from it are for checking only and must
              not be printed and issued to a member until the Union supplies the
              official artwork.
            </Notice>
          ) : null}

          <Section
            title="What is printed on this card"
            description="A snapshot taken when the card was issued. It does not change when the member record changes afterwards, because the card in the member’s pocket does not change either."
          >
            <DetailList>
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
                value={card.issueDate ? day(card.issueDate) : null}
                missing="Not yet issued"
              />
              <Detail
                label="Expires"
                value={card.expiryDate ? day(card.expiryDate) : "No expiry set"}
              />
            </DetailList>

            <div className="flex flex-wrap gap-3 border-t border-line pt-4">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void download()}
              >
                {card.cardNumber ? "Download card" : "Download proof"}
              </Button>
              {!card.cardNumber ? (
                <p className="self-center text-xs text-faint-foreground">
                  Overprinted <strong>PROOF — NOT ISSUED</strong> and carries no
                  card number.
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
        </TabsContent>

        {holds("member.read") ? (
          <TabsContent value="dues" className="grid gap-6 outline-none">
            <MemberDuesPanel memberId={card.member.id} />
          </TabsContent>
        ) : null}

        {canChangeStatus || canReplace ? (
          <TabsContent value="manage" className="grid gap-6 outline-none">
            {canChangeStatus ? (
              <Section
                title="Status"
                description="Each change asks for a reason, which is recorded in the audit trail. A card reported lost is never returned to active — it may be in somebody else’s hands — so a card found again is replaced rather than restored."
              >
                <div className="flex flex-wrap gap-3">
                  {isSuspended ? (
                    <Button
                      type="button"
                      onClick={() => setConfirming("RESTORE")}
                    >
                      Restore
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
                    variant="secondary"
                    onClick={() => setConfirming("LOST")}
                  >
                    Report lost
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => setConfirming("CANCEL")}
                  >
                    Cancel
                  </Button>
                </div>
              </Section>
            ) : null}

            {canReplace ? (
              <Section
                title="Replace"
                description="The original is superseded and a new card is prepared, carrying the same printed values. The replacement still needs approval before it is issued."
              >
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setConfirming("REPLACE")}
                  >
                    Replace this card
                  </Button>
                </div>
              </Section>
            ) : null}
          </TabsContent>
        ) : null}
      </Tabs>

      {confirming && asked ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setConfirming(null);
              setAddress("");
            }
          }}
          title={asked.title}
          description={<p>{asked.description}</p>}
          confirmLabel={asked.confirmLabel}
          tone={asked.tone}
          reason={
            asked.reason === "none"
              ? undefined
              : { optional: asked.reason === "optional" }
          }
          onConfirm={(reason) => confirmed(confirming, reason)}
        >
          {confirming === "REPLACE" ? (
            <Field
              label="Address as printed"
              htmlFor="replaceAddress"
              hint="Leave blank to carry the current address over."
            >
              <TextInput
                id="replaceAddress"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
            </Field>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
