"use client";

import type { InvitationList, InvitationSummary } from "@nurtw/contracts";
import { MailPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { shortDay } from "@/components/api-access";
import {
  ShareInvitationDialog,
  WithdrawInvitationDialog,
  shareInvitation,
  type SharedInvitation,
} from "@/components/invite-organisation";
import { OrganisationsHeader } from "@/components/organisations-header";
import {
  Button,
  EmptyState,
  ErrorNotice,
  Skeleton,
  StatusChip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { ApiError, fetcher } from "@/lib/api";
import { useSession } from "@/lib/session";

/**
 * The invitations sent to organisations (item 33, EXT-21): who was invited,
 * by whom, and what became of each link. An open one can be sent again or
 * withdrawn; a used one leads to the application it produced.
 */

/** What became of it, in a line beneath the chip. */
function outcome(invitation: InvitationSummary): string {
  if (invitation.used) {
    return `Applied ${shortDay(invitation.used.at)}`;
  }
  if (invitation.withdrawn) {
    return `Withdrawn ${shortDay(invitation.withdrawn.at)}${
      invitation.withdrawn.by ? ` by ${invitation.withdrawn.by}` : ""
    }`;
  }
  return invitation.standing === "EXPIRED"
    ? `Expired ${shortDay(invitation.expiresAt)}`
    : `Until ${shortDay(invitation.expiresAt)}`;
}

export default function InvitationsPage() {
  const { holds } = useSession();
  const canManage = holds("api_client.manage");
  const { data, error, isLoading, mutate } = useSWR<InvitationList>(
    holds("api_client.read") ? "/organisation-invitations" : null,
    fetcher,
  );
  const [shared, setShared] = useState<SharedInvitation | null>(null);
  const [withdrawing, setWithdrawing] = useState<InvitationSummary | null>(
    null,
  );

  const invitations = data?.invitations ?? [];
  const loadError = error instanceof ApiError ? error : null;

  return (
    <div className="grid max-w-5xl gap-6">
      <OrganisationsHeader />

      {loadError ? (
        <ErrorNotice
          message={loadError.message}
          requestId={loadError.requestId}
        />
      ) : null}

      {isLoading ? (
        <div className="grid gap-2" role="status" aria-label="Loading">
          <Skeleton className="h-10" />
          <Skeleton className="h-14" />
        </div>
      ) : invitations.length === 0 && !loadError ? (
        <EmptyState
          icon={<MailPlus aria-hidden />}
          title="No invitations sent yet"
          description={`An invitation is a link to the application form, addressed to one organisation. It works once and lasts ${data?.expiryDays ?? 14} days. The organisation still applies, and you still confirm and approve it.`}
        />
      ) : invitations.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground">
            A link works once and lasts {data?.expiryDays} days. It confirms
            nobody: telephone or write to the applicant before approving, as for
            any application.
          </p>
          <Table className="min-w-[52rem]">
            <TableHead>
              <tr>
                <TableHeader>Organisation</TableHeader>
                <TableHeader>Contact</TableHeader>
                <TableHeader>Link</TableHeader>
                <TableHeader>Sent</TableHeader>
                <TableHeader>
                  <span className="sr-only">Actions</span>
                </TableHeader>
              </tr>
            </TableHead>
            <TableBody>
              {invitations.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell>
                    <span className="font-medium">
                      {invitation.organisationName}
                    </span>
                    {invitation.note ? (
                      <span className="block text-xs text-faint-foreground">
                        {invitation.note}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {(invitation.contactName ??
                    invitation.contactEmail ??
                    invitation.contactPhone) ? (
                      <>
                        {invitation.contactName ? (
                          <span className="block text-foreground">
                            {invitation.contactName}
                          </span>
                        ) : null}
                        {invitation.contactEmail ? (
                          <span className="block text-xs">
                            {invitation.contactEmail}
                          </span>
                        ) : null}
                        {invitation.contactPhone ? (
                          <span className="block text-xs">
                            {invitation.contactPhone}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusChip status={invitation.standing} />
                    <span className="mt-1 block text-xs text-faint-foreground">
                      {outcome(invitation)}
                    </span>
                    {invitation.withdrawn?.reason ? (
                      <span className="block text-xs text-faint-foreground">
                        Reason: {invitation.withdrawn.reason}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {shortDay(invitation.createdAt)}
                    {invitation.createdBy ? (
                      <span className="block text-xs">
                        by {invitation.createdBy}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-2">
                      {invitation.standing === "OPEN" && canManage ? (
                        <>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={async () =>
                              setShared(await shareInvitation(invitation))
                            }
                          >
                            Send again
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setWithdrawing(invitation)}
                          >
                            Withdraw
                          </Button>
                        </>
                      ) : null}
                      {invitation.used?.apiClientId ? (
                        <Link
                          href={`/organisations/${invitation.used.apiClientId}`}
                          className="text-sm font-medium text-link underline-offset-2 hover:underline"
                        >
                          Open the application
                        </Link>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      ) : null}

      <ShareInvitationDialog
        shared={shared}
        onOpenChange={(open) => {
          if (!open) {
            setShared(null);
          }
        }}
      />
      <WithdrawInvitationDialog
        invitation={withdrawing}
        onOpenChange={(open) => {
          if (!open) {
            setWithdrawing(null);
          }
        }}
        onWithdrawn={() => void mutate()}
      />
    </div>
  );
}
