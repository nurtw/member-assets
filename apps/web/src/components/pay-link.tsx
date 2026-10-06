"use client";

import type { PayLinkSummary } from "@nurtw/contracts";
import QRCode from "qrcode";
import { useState } from "react";

import { Button, ErrorNotice } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError, api } from "@/lib/api";
import { useSession } from "@/lib/session";

/**
 * A vehicle's or member's personal pay link (PRD Requirement 27.8, revision
 * 1.9; PAY-21 — item 31), for an officer who may start payments.
 *
 * The link opens a public page that offers the published amount and never says
 * what is owed, so it is safe to send to the payer's phone. The officer shows
 * the QR code, copies the link, or opens WhatsApp or SMS with it written in;
 * the System sends nothing itself.
 */
export function PersonalPayLink({
  subjectType,
  subjectId,
}: {
  subjectType: "vehicle" | "member";
  subjectId: string;
}) {
  const { holds } = useSession();
  const [link, setLink] = useState<{
    summary: PayLinkSummary;
    url: string;
    qr: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [copied, setCopied] = useState(false);
  const [replacing, setReplacing] = useState(false);

  if (!holds("payment.initiate")) {
    return null;
  }

  async function show(summary: PayLinkSummary) {
    const url = `${window.location.origin}/pay/${summary.code}`;
    // Drawn here, in the browser: the link never leaves for a QR service.
    const qr = await QRCode.toDataURL(url, { margin: 1, width: 220 });
    setLink({ summary, url, qr });
    setCopied(false);
  }

  async function run(action: () => Promise<PayLinkSummary>) {
    setBusy(true);
    setError(null);
    try {
      await show(await action());
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.status === 404
            ? new ApiError(
                404,
                "A pay link cannot be made for this record from your office.",
                caught.requestId,
              )
            : caught
          : new ApiError(0, "The service could not be reached."),
      );
    } finally {
      setBusy(false);
    }
  }

  const message = link
    ? `Pay NURTW dues for ${link.summary.label} here: ${link.url}`
    : "";
  const action =
    "rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted";

  return (
    <div className="grid gap-3 border-t border-line pt-4">
      <div>
        <h3 className="text-sm font-semibold">Pay link to send</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          The payer opens it on their own phone and pays by card or transfer.
          The page shows the published amount, never what is owed.
        </p>
      </div>
      {error ? (
        <ErrorNotice message={error.message} requestId={error.requestId} />
      ) : null}

      {!link ? (
        <div>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              run(() =>
                api.post<PayLinkSummary>("/pay-links", {
                  subjectType,
                  subjectId,
                }),
              )
            }
          >
            Show the pay link
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URL drawn in the browser; there is nothing for next/image to optimise. */}
          <img
            src={link.qr}
            alt={`QR code for the pay link of ${link.summary.label}`}
            width={176}
            height={176}
            className="rounded-md border border-line bg-paper p-1"
          />
          <div className="grid min-w-0 gap-3">
            <p className="text-sm">
              For <span className="font-semibold">{link.summary.label}</span>.
              The payer scans the code, or opens the link:
            </p>
            <p className="break-all rounded-md bg-surface-muted px-3 py-2 font-mono text-xs">
              {link.url}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={action}
                onClick={async () => {
                  await navigator.clipboard.writeText(link.url);
                  setCopied(true);
                }}
              >
                {copied ? "Copied" : "Copy the link"}
              </button>
              <a
                className={action}
                href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Send by WhatsApp
              </a>
              <a
                className={action}
                href={`sms:?&body=${encodeURIComponent(message)}`}
              >
                Send by SMS
              </a>
            </div>

            <p className="text-xs text-faint-foreground">
              Sent to the wrong person?{" "}
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => setReplacing(true)}
              >
                Replace this link
              </button>
              . The old one stops working at once.
            </p>
            <ConfirmDialog
              open={replacing}
              onOpenChange={setReplacing}
              title="Replace this pay link?"
              description={
                <p>
                  The link and QR code already sent stop working at once. A new
                  link is made for {link.summary.label}, to send again.
                </p>
              }
              confirmLabel="Replace the link"
              onConfirm={async (reason) => {
                await show(
                  await api.post<PayLinkSummary>(
                    `/pay-links/${link.summary.id}/replace`,
                    { reason },
                  ),
                );
              }}
              reason={{ label: "Reason for replacing it" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
