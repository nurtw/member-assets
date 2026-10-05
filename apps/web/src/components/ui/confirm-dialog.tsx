"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, TextArea } from "@/components/ui/field";
import { ErrorNotice } from "@/components/ui/notice";
import { ApiError } from "@/lib/api";

/**
 * A dangerous act, confirmed (item 34, `DESIGN.md` §10).
 *
 * Suspending, withdrawing, revoking, refusing: each stops something for
 * somebody, so it is never one click. The dialog says in words what will
 * happen, asks for the reason the audit trail keeps (PRD Requirement 18.1),
 * and only then acts. A failure is shown here, with its reference, and the
 * dialog stays open; it closes once the act has succeeded.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = "danger",
  reason,
  children,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What will happen, and what it cannot be undone into. */
  description: ReactNode;
  /** The act, as a verb: "Suspend", "Withdraw the application". */
  confirmLabel: string;
  tone?: "danger" | "primary";
  /** Ask for a reason. Left out, none is asked. */
  reason?: { label?: string; hint?: string; minLength?: number };
  /** Anything else the act needs, between the description and the reason. */
  children?: ReactNode;
  /**
   * Does it. Throw an `ApiError` to show it and keep the dialog open; return
   * to close it.
   */
  onConfirm: (reason: string) => Promise<void>;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [issue, setIssue] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const minLength = reason?.minLength ?? 4;

  function close(next: boolean) {
    if (!next) {
      setText("");
      setIssue(undefined);
      setFailure(null);
    }
    onOpenChange(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const given = text.trim();
    if (reason && given.length < minLength) {
      setIssue(`Give a reason of at least ${minLength} characters.`);
      return;
    }
    setIssue(undefined);
    setFailure(null);
    setBusy(true);
    try {
      await onConfirm(given);
      close(false);
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
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription asChild>
              <div>{description}</div>
            </DialogDescription>
          </DialogHeader>
          {failure ? (
            <ErrorNotice
              message={failure.message}
              requestId={failure.requestId}
            />
          ) : null}
          {children}
          {reason ? (
            <Field
              label={reason.label ?? "Reason"}
              htmlFor={id}
              required
              hint={reason.hint ?? "Recorded in the audit trail."}
              error={issue}
            >
              <TextArea
                id={id}
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={1000}
                rows={2}
                autoFocus
              />
            </Field>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => close(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={tone === "danger" ? "danger" : "primary"}
              disabled={busy}
            >
              {busy ? "Working…" : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
