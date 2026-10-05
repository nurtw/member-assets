"use client";

import {
  createInvitationSchema,
  withdrawInvitationSchema,
  type InvitationSummary,
} from "@nurtw/contracts";
import { Copy, Mail, MessageCircle, MessageSquare } from "lucide-react";
import QRCode from "qrcode";
import { useState, type FormEvent } from "react";

import { explained, shortDay } from "@/components/api-access";
import {
  Button,
  ErrorNotice,
  Field,
  TextArea,
  TextInput,
  buttonVariants,
} from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError, api } from "@/lib/api";

/**
 * Inviting an organisation to apply (PRD Requirement 12.11, revision 1.10;
 * `QUESTIONS.md` EXT-21 — item 33).
 *
 * The administrator names the organisation and gets a link to send however
 * they choose: copied, by WhatsApp, SMS, or their own email, or shown as a QR
 * code. The System sends nothing itself. The link opens the application form
 * addressed to that organisation, once, until it expires. It confirms nobody:
 * the application it produces is confirmed and decided as any other.
 */

export interface SharedInvitation {
  invitation: InvitationSummary;
  url: string;
  /** A data URL, drawn in the browser: the link goes to no QR service. */
  qr: string;
}

export function invitationUrl(code: string): string {
  return `${window.location.origin}/portal/apply?invite=${code}`;
}

export async function shareInvitation(
  invitation: InvitationSummary,
): Promise<SharedInvitation> {
  const url = invitationUrl(invitation.code);
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 220 });
  return { invitation, url, qr };
}

function messageFor({ invitation, url }: SharedInvitation): string {
  return (
    `The NURTW Anambra State Council invites ${invitation.organisationName} to apply for ` +
    `access to its verification service. Apply here: ${url} ` +
    `The link is for ${invitation.organisationName} alone and works until ` +
    `${shortDay(invitation.expiresAt)}. Every application is confirmed and decided by the Union.`
  );
}

const sendClass = buttonVariants({ variant: "secondary", size: "sm" });

/** The link, the ways to send it, and its QR code. */
export function InvitationShare({ shared }: { shared: SharedInvitation }) {
  const [copied, setCopied] = useState<"link" | "message" | null>(null);
  const { invitation, url, qr } = shared;
  const message = messageFor(shared);

  async function copy(what: "link" | "message") {
    try {
      await navigator.clipboard.writeText(what === "link" ? url : message);
      setCopied(what);
    } catch {
      // No clipboard in this browser: the link is on the page to select.
      setCopied(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
        {/* eslint-disable-next-line @next/next/no-img-element -- a data URL drawn in the browser; there is nothing for next/image to optimise. */}
        <img
          src={qr}
          alt={`QR code for the invitation of ${invitation.organisationName}`}
          width={160}
          height={160}
          className="rounded-md border border-line bg-paper p-1"
        />
        <div className="grid min-w-0 gap-3">
          <p className="text-sm">
            For{" "}
            <span className="font-semibold">{invitation.organisationName}</span>
            . It works once, until {shortDay(invitation.expiresAt)}.
          </p>
          <p className="select-all break-all rounded-md bg-surface-muted px-3 py-2 font-mono text-xs">
            {url}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={sendClass}
              onClick={() => void copy("link")}
            >
              <Copy aria-hidden />
              {copied === "link" ? "Copied" : "Copy the link"}
            </button>
            <a
              className={sendClass}
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle aria-hidden />
              WhatsApp
            </a>
            <a
              className={sendClass}
              href={`sms:${invitation.contactPhone ?? ""}?&body=${encodeURIComponent(message)}`}
            >
              <MessageSquare aria-hidden />
              SMS
            </a>
            <a
              className={sendClass}
              href={`mailto:${invitation.contactEmail ?? ""}?subject=${encodeURIComponent(
                "Invitation to apply for NURTW verification access",
              )}&body=${encodeURIComponent(message)}`}
            >
              <Mail aria-hidden />
              Email
            </a>
          </div>
        </div>
      </div>

      <div className="grid gap-1.5">
        <p className="text-sm font-medium">Message to send</p>
        <p className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-muted-foreground">
          {message}
        </p>
        <div>
          <button
            type="button"
            className={sendClass}
            onClick={() => void copy("message")}
          >
            <Copy aria-hidden />
            {copied === "message" ? "Copied" : "Copy the message"}
          </button>
        </div>
      </div>

      <p className="text-xs text-faint-foreground">
        The System sends nothing itself: each button opens your own app with the
        message written in. The invitation confirms nobody. Telephone or write
        to the applicant before approving, as for any application.
      </p>
    </div>
  );
}

/** Names the organisation, makes the link, then shows how to send it. */
export function InviteOrganisationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    organisationName: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    note: "",
  });
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState<SharedInvitation | null>(null);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  function close(next: boolean) {
    if (!next) {
      // Start afresh next time: a link is shown once here, then lives in the list.
      setForm({
        organisationName: "",
        contactName: "",
        contactEmail: "",
        contactPhone: "",
        note: "",
      });
      setIssues({});
      setFailure(null);
      setShared(null);
    }
    onOpenChange(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFailure(null);
    // The name always goes to the schema, so an empty one gets its own
    // message. Of the rest, only what was filled in is sent.
    const { organisationName, ...rest } = form;
    const parsed = createInvitationSchema.safeParse({
      organisationName,
      ...Object.fromEntries(
        Object.entries(rest).filter(([, value]) => value.trim().length > 0),
      ),
    });
    if (!parsed.success) {
      const found: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "");
        found[field] ??= issue.message;
      }
      setIssues(found);
      return;
    }
    setIssues({});
    setBusy(true);
    try {
      const invitation = await api.post<InvitationSummary>(
        "/organisation-invitations",
        parsed.data,
      );
      setShared(await shareInvitation(invitation));
      onCreated();
    } catch (caught) {
      setFailure(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "The service could not be reached."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-xl">
        {shared ? (
          <>
            <DialogHeader>
              <DialogTitle>Invitation ready to send</DialogTitle>
              <DialogDescription>
                It is also kept under Invitations, where it can be sent again or
                withdrawn.
              </DialogDescription>
            </DialogHeader>
            <InvitationShare shared={shared} />
            <DialogFooter>
              <Button type="button" onClick={() => close(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="grid gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>Invite an organisation</DialogTitle>
              <DialogDescription>
                Makes a link to the application form, addressed to the
                organisation you name. The organisation still applies, and you
                still confirm and approve it.
              </DialogDescription>
            </DialogHeader>
            {failure ? (
              <ErrorNotice
                message={failure.message}
                requestId={failure.requestId}
              />
            ) : null}
            <Field
              label="Organisation"
              htmlFor="inviteOrganisation"
              required
              hint="As it should appear on the form."
              error={issues.organisationName}
            >
              <TextInput
                id="inviteOrganisation"
                value={form.organisationName}
                onChange={(event) =>
                  set("organisationName")(event.target.value)
                }
                maxLength={200}
                autoFocus
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Contact's name"
                htmlFor="inviteContactName"
                error={issues.contactName}
              >
                <TextInput
                  id="inviteContactName"
                  value={form.contactName}
                  onChange={(event) => set("contactName")(event.target.value)}
                />
              </Field>
              <Field
                label="Contact's phone"
                htmlFor="inviteContactPhone"
                error={issues.contactPhone}
              >
                <TextInput
                  id="inviteContactPhone"
                  inputMode="tel"
                  value={form.contactPhone}
                  onChange={(event) => set("contactPhone")(event.target.value)}
                />
              </Field>
            </div>
            <Field
              label="Contact's email"
              htmlFor="inviteContactEmail"
              error={issues.contactEmail}
            >
              <TextInput
                id="inviteContactEmail"
                type="email"
                value={form.contactEmail}
                onChange={(event) => set("contactEmail")(event.target.value)}
              />
            </Field>
            <Field
              label="Note"
              htmlFor="inviteNote"
              hint="For the Union's own record: why it is being invited."
              error={issues.note}
            >
              <TextArea
                id="inviteNote"
                value={form.note}
                onChange={(event) => set("note")(event.target.value)}
                maxLength={500}
                rows={2}
              />
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => close(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Making the link…" : "Make the invitation link"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Sending an invitation again, from the list. */
export function ShareInvitationDialog({
  shared,
  onOpenChange,
}: {
  shared: SharedInvitation | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={shared !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Send the invitation</DialogTitle>
          <DialogDescription>
            The same link as before. It still works once, until it expires.
          </DialogDescription>
        </DialogHeader>
        {shared ? <InvitationShare shared={shared} /> : null}
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Withdrawing an open invitation: its link stops working at once. */
export function WithdrawInvitationDialog({
  invitation,
  onOpenChange,
  onWithdrawn,
}: {
  invitation: InvitationSummary | null;
  onOpenChange: (open: boolean) => void;
  onWithdrawn: () => void;
}) {
  const [reason, setReason] = useState("");
  const [issue, setIssue] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  function close(next: boolean) {
    if (!next) {
      setReason("");
      setIssue(undefined);
      setFailure(null);
    }
    onOpenChange(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!invitation) {
      return;
    }
    const parsed = withdrawInvitationSchema.safeParse({ reason });
    if (!parsed.success) {
      setIssue(parsed.error.issues[0]?.message);
      return;
    }
    setIssue(undefined);
    setFailure(null);
    setBusy(true);
    try {
      await api.post(
        `/organisation-invitations/${invitation.id}/withdrawal`,
        parsed.data,
      );
      onWithdrawn();
      close(false);
    } catch (caught) {
      setFailure(
        explained(
          caught,
          "This invitation is no longer open: it was used, withdrawn, or has expired. The list now shows which.",
        ),
      );
      onWithdrawn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={invitation !== null} onOpenChange={close}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Withdraw this invitation?</DialogTitle>
            <DialogDescription>
              The link sent to {invitation?.organisationName} stops working at
              once. It cannot be reopened; invite the organisation again if it
              is still wanted.
            </DialogDescription>
          </DialogHeader>
          {failure ? (
            <ErrorNotice
              message={failure.message}
              requestId={failure.requestId}
            />
          ) : null}
          <Field
            label="Reason"
            htmlFor="withdrawReason"
            required
            hint="Recorded in the audit trail."
            error={issue}
          >
            <TextInput
              id="withdrawReason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={1000}
              autoFocus
            />
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => close(false)}
            >
              Keep it
            </Button>
            <Button type="submit" variant="danger" disabled={busy}>
              {busy ? "Withdrawing…" : "Withdraw the invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
