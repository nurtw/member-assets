"use client";

import type {
  ApiClientList,
  ApplicationSummary,
  CardSummary,
} from "@nurtw/contracts";
import {
  ArrowRight,
  Building2,
  Bus,
  FilePlus2,
  FileText,
  IdCard,
  KeyRound,
  ScanLine,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import useSWR from "swr";

import { Card, PageHeader, Skeleton } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { useSession } from "@/lib/session";

/**
 * What is waiting for this officer, and where to start (item 34).
 *
 * Every figure comes from a list the officer may already read, limited by the
 * API to their own area of responsibility. Nothing here is counted for them
 * that they could not open and count themselves, and no route was added to
 * make it. A queue the officer cannot read is not shown at all.
 */

function Queue({
  icon: Icon,
  title,
  count,
  description,
  href,
  action,
}: {
  icon: LucideIcon;
  title: string;
  /** `undefined` while it loads. */
  count: number | undefined;
  description: string;
  href: string;
  action: string;
}) {
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon className="size-4 shrink-0" aria-hidden />
        {title}
      </div>
      {count === undefined ? (
        <Skeleton className="mt-3 h-9 w-14" />
      ) : (
        <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
          {count.toLocaleString("en-GB")}
        </p>
      )}
      <p className="mt-1 flex-1 text-sm text-muted-foreground">{description}</p>
      <Link
        href={href}
        className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-link underline-offset-2 hover:underline"
      >
        {action}
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </Card>
  );
}

function Start({
  icon: Icon,
  title,
  description,
  href,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-surface-muted"
    >
      <span className="rounded-md border border-line bg-surface-muted p-2 text-brand-text">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">
          {description}
        </span>
      </span>
    </Link>
  );
}

export default function OverviewPage() {
  const { user, holds } = useSession();
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
  const anyQueue = readsApplications || readsCards || readsOrganisations;

  const declares = holds("vehicle.declare");
  const starts: {
    icon: LucideIcon;
    title: string;
    description: string;
    href: string;
  }[] = [];
  if (holds("verification.perform") || holds("verification.membership")) {
    starts.push({
      icon: ScanLine,
      title: "Verify a vehicle or a card",
      description: "Check a plate, a sticker, or a membership card.",
      href: "/verify",
    });
  }
  if (holds("member.create")) {
    starts.push({
      icon: FilePlus2,
      title: "Register an applicant",
      description: "Record a new membership application.",
      href: "/applications/new",
    });
  }
  if (declares || holds("vehicle.record")) {
    starts.push({
      icon: Bus,
      title: declares ? "Declare a vehicle" : "Record a vehicle",
      description: declares
        ? "Declare a vehicle, or one already on record."
        : "Put a vehicle on record.",
      href: "/vehicles/new",
    });
  }
  if (holds("api_client.manage")) {
    starts.push({
      icon: Building2,
      title: "Invite an organisation",
      description: "Send an outside organisation a link to apply.",
      href: "/organisations",
    });
  }
  if (holds("user.manage")) {
    starts.push({
      icon: UserPlus,
      title: "Add an officer",
      description: "Give somebody an account, then their access.",
      href: "/settings/users",
    });
  }

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Overview"
        description={`Signed in as ${user?.fullName ?? "an officer"}. What is waiting in your area of responsibility, and where to start.`}
      />

      {anyQueue ? (
        <section aria-labelledby="waiting" className="grid gap-3">
          <h2 id="waiting" className="text-sm font-semibold">
            Waiting for a decision
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {readsApplications ? (
              <Queue
                icon={FileText}
                title="Applications to decide"
                count={applicationsWaiting}
                description="Submitted or under review, awaiting approval or refusal."
                href="/applications"
                action="Open applications"
              />
            ) : null}
            {readsCards ? (
              <Queue
                icon={IdCard}
                title="Cards to approve"
                count={cardsToApprove.data?.cards.length}
                description="Prepared and awaiting approval before they are issued."
                href="/cards"
                action="Open cards"
              />
            ) : null}
            {readsCards ? (
              <Queue
                icon={IdCard}
                title="Cards to hand over"
                count={cardsToCollect.data?.cards.length}
                description="Issued, and not yet recorded as collected."
                href="/cards"
                action="Open cards"
              />
            ) : null}
            {readsOrganisations ? (
              <Queue
                icon={Building2}
                title="Organisations to decide"
                count={
                  clients?.filter((client) => client.status === "PENDING")
                    .length
                }
                description="Registered, invited, or applied, and awaiting approval."
                href="/organisations"
                action="Open organisations"
              />
            ) : null}
            {readsOrganisations ? (
              <Queue
                icon={KeyRound}
                title="Tokens to replace soon"
                count={
                  clients?.filter((client) => client.currentToken?.expiringSoon)
                    .length
                }
                description="Organisations whose token expires within the reminder period."
                href="/organisations"
                action="Open organisations"
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {starts.length > 0 ? (
        <section aria-labelledby="start" className="grid gap-3">
          <h2 id="start" className="text-sm font-semibold">
            Start something
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {starts.map((start) => (
              <Start key={start.href} {...start} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
