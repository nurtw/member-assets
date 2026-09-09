"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/**
 * Shared form and layout primitives.
 *
 * DESIGN.md §3 is the rule that shapes these: **colour never carries meaning
 * alone.** Red and green are the Union's identity and also the worst possible
 * pair for red-green colour vision deficiency, so every state below is carried
 * by a word and a shape as well as a tone, and each remains legible in greyscale.
 */

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {required ? (
          <span className="ml-1 text-[var(--verdict-deny)]" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      {hint ? <p className="text-xs text-black/55">{hint}</p> : null}
      {children}
      {/* Announced, not merely coloured: a screen reader must hear the failure. */}
      {error ? (
        <p role="alert" className="text-xs font-medium text-[var(--verdict-deny)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const control =
  "w-full rounded-md border border-[var(--border-subtle)] bg-white px-3 py-2 text-sm " +
  "outline-none transition focus:border-[var(--nurtw-green)] focus:ring-2 " +
  "focus:ring-[var(--nurtw-green)]/25 disabled:bg-[var(--surface-muted)] disabled:text-black/50";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${control} ${props.className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...props} className={`${control} ${props.className ?? ""}`} rows={props.rows ?? 3} />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${control} ${props.className ?? ""}`} />;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: InputHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
}) {
  const styles = {
    primary:
      "bg-[var(--nurtw-green)] text-white hover:bg-[var(--nurtw-green-deep)] focus-visible:ring-[var(--nurtw-green)]",
    secondary:
      "bg-white text-[var(--foreground)] border border-[var(--border-subtle)] hover:bg-[var(--surface-muted)] focus-visible:ring-[var(--nurtw-navy)]",
    danger:
      "bg-[var(--verdict-deny)] text-white hover:brightness-110 focus-visible:ring-[var(--verdict-deny)]",
  }[variant];

  return (
    <button
      {...(props as object)}
      className={
        "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold " +
        "transition outline-none focus-visible:ring-2 focus-visible:ring-offset-2 " +
        "disabled:cursor-not-allowed disabled:opacity-60 " +
        `${styles} ${className}`
      }
    />
  );
}

/**
 * A status chip.
 *
 * The status word is the content; the tone is decoration. Read this in greyscale
 * and it still says APPROVED or REJECTED, which is DESIGN.md §3 applied to the
 * smallest component that carries a verdict.
 */
export function StatusChip({ status }: { status: string }) {
  const tone: Record<string, string> = {
    DRAFT: "bg-[var(--surface-muted)] text-black/70 border-[var(--border-subtle)]",
    SUBMITTED: "bg-[var(--verdict-caution-surface)] text-[var(--verdict-caution)] border-[var(--verdict-caution)]/30",
    UNDER_REVIEW: "bg-[var(--verdict-caution-surface)] text-[var(--verdict-caution)] border-[var(--verdict-caution)]/30",
    APPROVED: "bg-[var(--verdict-affirm-surface)] text-[var(--verdict-affirm)] border-[var(--verdict-affirm)]/30",
    ACTIVE: "bg-[var(--verdict-affirm-surface)] text-[var(--verdict-affirm)] border-[var(--verdict-affirm)]/30",
    REJECTED: "bg-[var(--verdict-deny-surface)] text-[var(--verdict-deny)] border-[var(--verdict-deny)]/30",
    CANCELLED: "bg-[var(--verdict-deny-surface)] text-[var(--verdict-deny)] border-[var(--verdict-deny)]/30",
    SUSPENDED: "bg-[var(--verdict-deny-surface)] text-[var(--verdict-deny)] border-[var(--verdict-deny)]/30",
    WITHDRAWN: "bg-[var(--surface-muted)] text-black/70 border-[var(--border-subtle)]",
    PENDING: "bg-[var(--surface-muted)] text-black/70 border-[var(--border-subtle)]",
  };

  return (
    <span
      className={
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide " +
        (tone[status] ?? tone.PENDING)
      }
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

/**
 * A failure notice.
 *
 * Shows the request id when there is one. The API's messages are deliberately
 * uninformative, so the id is the only thing that makes a report actionable.
 */
export function ErrorNotice({
  message,
  requestId,
}: {
  message: string;
  requestId?: string;
}) {
  return (
    <div
      role="alert"
      className="rounded-md border border-[var(--verdict-deny)]/30 bg-[var(--verdict-deny-surface)] px-4 py-3 text-sm"
    >
      <p className="font-semibold text-[var(--verdict-deny)]">Unable to continue</p>
      <p className="mt-1 text-[var(--foreground)]">{message}</p>
      {requestId ? (
        <p className="mt-2 font-mono text-xs text-black/55">
          Reference {requestId}
        </p>
      ) : null}
    </div>
  );
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--border-subtle)] bg-white p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm text-black/60">{description}</p>
      ) : null}
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}
