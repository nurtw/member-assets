import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/cn";

/**
 * Form fields: a label, an optional hint, the control, and an error that is
 * announced, not merely coloured.
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
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
        {required ? (
          <span className="ml-1 text-verdict-deny" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {children}
      {/* Announced, not merely coloured: a screen reader must hear the failure. */}
      {error ? (
        <p role="alert" className="text-xs font-medium text-verdict-deny">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A control's outline is `line-strong`, which reaches 3:1 against its surface
 * in both themes (WCAG 1.4.11): the field must be findable without its label.
 */
export const controlClass =
  "w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-foreground " +
  "placeholder:text-faint-foreground outline-none transition-colors " +
  "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 " +
  "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted-foreground";

export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(controlClass, className)} />;
}

export function TextArea({
  className,
  rows,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      rows={rows ?? 3}
      className={cn(controlClass, className)}
    />
  );
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(controlClass, "pr-8", className)} />;
}
