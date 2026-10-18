"use client";

import type { MemberSmsMessages, SmsMessageSummary } from "@nurtw/contracts";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

import { moment } from "@/components/api-access";
import {
  Button,
  EmptyState,
  ErrorNotice,
  Loading,
  Section,
  StatusChip,
} from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { useSession } from "@/lib/session";
import { canResend, smsStatusExplanation } from "@/lib/sms";

/**
 * The text messages sent to a member (item 45): each payment's confirmation,
 * what it said, and what became of it. "No message, not paid", so a lost
 * message is a dispute at the park, and an officer who takes payments can
 * send the latest confirmation again. Only the last four digits of the number
 * are ever shown.
 */
export function MemberMessagesPanel({ memberId }: { memberId: string }) {
  const { holds } = useSession();
  const { data, error, isLoading, mutate } = useSWR<MemberSmsMessages>(
    `/members/${memberId}/messages`,
    fetcher,
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);

  const messages = data?.messages ?? [];
  const latest = messages.find(canResend) ?? null;
  const offerResend =
    holds("payment.initiate") && data?.sending === true && latest !== null;

  async function resend(message: SmsMessageSummary) {
    setBusy(true);
    setFailure(null);
    try {
      await api.post(`/members/${memberId}/messages/${message.id}/resend`, {});
      toast.success("The confirmation will be sent again in a few seconds.");
      await mutate();
    } catch (caught) {
      setFailure(
        caught instanceof ApiError && caught.status === 409
          ? new ApiError(
              409,
              "Messages are switched off, so nothing can be sent.",
              caught.requestId,
            )
          : caught instanceof ApiError
            ? caught
            : new ApiError(0, "The service could not be reached."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Text messages"
      description="Each payment is confirmed to the member by SMS. Only the last four digits of their number are shown."
      actions={
        offerResend ? (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void resend(latest)}
          >
            {busy ? "Sending…" : "Send the latest again"}
          </Button>
        ) : null
      }
    >
      {error instanceof ApiError ? (
        <ErrorNotice message={error.message} requestId={error.requestId} />
      ) : null}
      {failure ? (
        <ErrorNotice message={failure.message} requestId={failure.requestId} />
      ) : null}
      {isLoading ? <Loading rows={2} /> : null}
      {data && messages.length === 0 ? (
        <EmptyState
          title="No messages yet"
          description="A message is sent when a payment is credited to this member."
        />
      ) : null}
      {messages.length > 0 ? (
        <ul className="grid gap-3">
          {messages.map((message) => (
            <li
              key={message.id}
              className="grid gap-1.5 rounded-md border border-line p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {message.resendOf
                    ? "Payment confirmation, sent again"
                    : "Payment confirmation"}
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    · {moment(message.sentAt ?? message.createdAt)}
                    {message.recipientLastFour
                      ? ` · to the number ending ${message.recipientLastFour}`
                      : ""}
                  </span>
                </span>
                <StatusChip status={message.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                {smsStatusExplanation(message)}
              </p>
              {message.text ? (
                <p className="rounded bg-surface-muted px-2 py-1.5 font-mono text-xs break-words">
                  {message.text}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}
