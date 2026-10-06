"use client";

import type {
  ApiClientList,
  ApplicationSummary,
  CardSummary,
} from "@nurtw/contracts";
import {
  Building2,
  Bus,
  CreditCard,
  FilePlus2,
  PackagePlus,
  ScanLine,
  Sticker,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { AssignStickerDialog } from "@/components/assign-sticker-dialog";
import { fetcher } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";

/**
 * The officer's home (item 34; the owner's direction of 5 October 2026): one
 * screen, no scrolling, of what this officer can start, with what is waiting
 * for them along the top.
 *
 * Each tile is something the officer holds the permission to do. Each figure
 * comes from a list the officer may already read, limited by the API to their
 * own area of responsibility: nothing is counted for them here that they
 * could not open and count themselves, and no route was added to make it.
 */

const tileClass =
  "group flex min-h-24 flex-col justify-between gap-3 rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:border-line-strong hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:p-5";

function TileBody({
  icon: Icon,
  title,
  text,
  primary,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  primary: boolean;
}) {
  return (
    <>
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-lg border",
          primary
            ? "border-primary bg-primary text-on-solid"
            : "border-line bg-surface-muted text-brand-text",
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-base font-semibold leading-tight">
          {title}
        </span>
        {/* The words fit a phone's tile only from a small tablet up. */}
        <span className="mt-1 hidden text-sm text-muted-foreground sm:block">
          {text}
        </span>
      </span>
    </>
  );
}

interface Action {
  key: string;
  icon: LucideIcon;
  title: string;
  text: string;
  /** Where it goes; or `onClick`, for one that asks something first. */
  href?: string;
  onClick?: () => void;
}

function Waiting({
  count,
  one,
  many,
  href,
}: {
  /** `undefined` while it loads. */
  count: number | undefined;
  one: string;
  many: string;
  href: string;
}) {
  if (!count) {
    return null;
  }
  return (
    <li>
      <Link
        href={href}
        className="inline-flex items-center gap-2 rounded-full border border-verdict-caution/40 bg-verdict-caution-surface px-3 py-1 text-sm text-verdict-caution transition-colors hover:brightness-95"
      >
        <span className="font-semibold tabular-nums">
          {count.toLocaleString("en-GB")}
        </span>
        {count === 1 ? one : many}
      </Link>
    </li>
  );
}

export default function HomePage() {
  const { user, holds } = useSession();
  const [assigning, setAssigning] = useState(false);
  const readsApplications = holds("application.read");
  const readsCards = holds("card.read");
  const readsOrganisations = holds("api_client.read");

  const submitted = useSWR<{ applications: ApplicationSummary[] }>(
    readsApplications ? "/applications?status=SUBMITTED" : null,
    fetcher,
  );
  const underReview = useSWR<{ applications: ApplicationSummary[] }>(
    readsApplications ? "/applications?status=UNDER_REVIEW" : null,
    fetcher,
  );
  const cardsToApprove = useSWR<{ cards: CardSummary[] }>(
    readsCards ? "/cards?status=PENDING_APPROVAL" : null,
    fetcher,
  );
  const cardsToCollect = useSWR<{ cards: CardSummary[] }>(
    readsCards ? "/cards?status=ISSUED" : null,
    fetcher,
  );
  const organisations = useSWR<ApiClientList>(
    readsOrganisations ? "/api-clients" : null,
    fetcher,
  );

  const applicationsWaiting =
    submitted.data && underReview.data
      ? submitted.data.applications.length +
        underReview.data.applications.length
      : undefined;
  const clients = organisations.data?.clients;
  const counts = [
    applicationsWaiting,
    cardsToApprove.data?.cards.length,
    cardsToCollect.data?.cards.length,
    clients?.filter((client) => client.status === "PENDING").length,
    clients?.filter((client) => client.currentToken?.expiringSoon).length,
  ];
  const reads = readsApplications || readsCards || readsOrganisations;
  const loaded =
    (!readsApplications || applicationsWaiting !== undefined) &&
    (!readsCards || (cardsToApprove.data && cardsToCollect.data)) &&
    (!readsOrganisations || clients);
  const nothingWaiting = loaded && counts.every((count) => !count);

  const verifies =
    holds("verification.perform") || holds("verification.membership");
  const declares = holds("vehicle.declare");
  const actions: Action[] = [];
  if (verifies) {
    actions.push({
      key: "verify",
      icon: ScanLine,
      title: "Verify",
      text: "Check a plate, a sticker, or a membership card.",
      href: "/verify",
    });
  }
  if (holds("member.create")) {
    actions.push({
      key: "register",
      icon: FilePlus2,
      title: "Register a member",
      text: "Record a new membership application.",
      href: "/applications/new",
    });
  }
  if (declares || holds("vehicle.record")) {
    actions.push({
      key: "vehicle",
      icon: Bus,
      title: "Add a vehicle",
      text: declares
        ? "Declare a vehicle, or one already on record."
        : "Put a vehicle on record.",
      href: "/vehicles/new",
    });
  }
  if (holds("sticker.attach") && holds("vehicle.read")) {
    actions.push({
      key: "sticker",
      icon: Sticker,
      title: "Assign a sticker",
      text: "Find the vehicle, take the fee, scan the sticker.",
      onClick: () => setAssigning(true),
    });
  }
  if (holds("payment.initiate") && verifies) {
    actions.push({
      key: "payment",
      icon: CreditCard,
      title: "Take a payment",
      text: "Check the plate or the card, then Pay now.",
      href: "/verify",
    });
  }
  if (holds("sticker.stock_intake")) {
    actions.push({
      key: "stock",
      icon: PackagePlus,
      title: "Add sticker stock",
      text: "Scan printed stickers into stock.",
      href: "/stickers/stock",
    });
  }
  if (holds("api_client.manage")) {
    actions.push({
      key: "invite",
      icon: Building2,
      title: "Invite an organisation",
      text: "Send an outside organisation a link to apply.",
      href: "/organisations",
    });
  }
  if (holds("user.manage")) {
    actions.push({
      key: "officer",
      icon: UserPlus,
      title: "Add an officer",
      text: "Give somebody an account, then their access.",
      href: "/settings/users",
    });
  }

  return (
    // The shell's bar, its padding, and its footer take about twelve rem of
    // the screen; the tiles share out what is left, so the page fills one
    // screen and does not scroll.
    <div className="flex min-h-[calc(100dvh-12.5rem)] flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {user ? `Welcome, ${user.fullName.split(" ")[0]}` : "Welcome"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What would you like to do?
        </p>
      </div>

      {reads ? (
        <section aria-labelledby="waiting">
          <h2 id="waiting" className="sr-only">
            Waiting for you
          </h2>
          {nothingWaiting ? (
            <p className="text-sm text-muted-foreground">
              Nothing is waiting for a decision.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              <Waiting
                count={counts[0]}
                one="application to decide"
                many="applications to decide"
                href="/applications"
              />
              <Waiting
                count={counts[1]}
                one="card to approve"
                many="cards to approve"
                href="/cards"
              />
              <Waiting
                count={counts[2]}
                one="card to hand over"
                many="cards to hand over"
                href="/cards"
              />
              <Waiting
                count={counts[3]}
                one="organisation to decide"
                many="organisations to decide"
                href="/organisations"
              />
              <Waiting
                count={counts[4]}
                one="token to replace soon"
                many="tokens to replace soon"
                href="/organisations"
              />
            </ul>
          )}
        </section>
      ) : null}

      {actions.length > 0 ? (
        <section aria-labelledby="actions" className="flex flex-1 flex-col">
          <h2 id="actions" className="sr-only">
            Quick actions
          </h2>
          <div
            className={cn(
              "grid flex-1 auto-rows-fr grid-cols-2 gap-3",
              actions.length > 4 ? "lg:grid-cols-4" : "lg:grid-cols-2",
            )}
          >
            {actions.map((action, index) =>
              action.href ? (
                <Link key={action.key} href={action.href} className={tileClass}>
                  <TileBody {...action} primary={index === 0} />
                </Link>
              ) : (
                <button
                  key={action.key}
                  type="button"
                  onClick={action.onClick}
                  className={tileClass}
                >
                  <TileBody {...action} primary={index === 0} />
                </button>
              ),
            )}
          </div>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">
          Use the menu to open the screens you have access to.
        </p>
      )}

      <AssignStickerDialog open={assigning} onOpenChange={setAssigning} />
    </div>
  );
}
