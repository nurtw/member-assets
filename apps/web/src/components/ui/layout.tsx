import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * The pieces every page is built from (items 32 and 34; the patterns are
 * `DESIGN.md` §10): its header, the bar above a list, a record's facts, a
 * placeholder while it loads, a state with nothing in it yet, and a key on the
 * keyboard.
 */

export function PageHeader({
  title,
  description,
  actions,
  back,
  status,
  meta,
  mono = false,
}: {
  title: string;
  description?: ReactNode;
  /** The page's primary action first. One primary action to a page. */
  actions?: ReactNode;
  /** Where a record's page came from: its list. */
  back?: { href: string; label: string };
  /** A status chip beside the title, on a record's page. */
  status?: ReactNode;
  /** One line of facts beneath the title: when, and by whom. */
  meta?: ReactNode;
  /** Set the title in the fixed-width face: a plate, a number. */
  mono?: boolean;
}) {
  return (
    <div className="grid gap-2">
      {back ? (
        <div>
          <Link
            href={back.href}
            className="inline-flex items-center gap-1 rounded text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden />
            {back.label}
          </Link>
        </div>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1
              className={cn(
                "text-2xl font-semibold tracking-tight",
                mono && "font-mono",
              )}
            >
              {title}
            </h1>
            {status}
          </div>
          {meta ? (
            <p className="mt-1 text-sm text-muted-foreground">{meta}</p>
          ) : null}
          {description ? (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The bar above a list: what narrows it on the left, how many it shows on the
 * right. The count is announced when it changes.
 */
export function ListToolbar({
  children,
  count,
}: {
  children?: ReactNode;
  count?: string;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      {children}
      {count ? (
        <p className="ml-auto text-sm text-muted-foreground" role="status">
          {count}
        </p>
      ) : null}
    </div>
  );
}

/** "12 in all", or "3 of 12" when something narrows the list. */
export function listCount(shown: number, total: number): string {
  return shown === total ? `${total} in all` : `${shown} of ${total}`;
}

/** One fact of a record: its name above, its value below, never blank. */
export function Detail({
  label,
  value,
  children,
  missing = "Not stated",
}: {
  label: string;
  /** A plain value; nothing, or an empty string, reads as missing. */
  value?: string | null;
  children?: ReactNode;
  missing?: string;
}) {
  const content = children ?? (value && value.length > 0 ? value : null);
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-faint-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-sm">
        {content ?? (
          <span className="italic text-faint-foreground">{missing}</span>
        )}
      </dd>
    </div>
  );
}

const DETAIL_COLUMNS = {
  1: "",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
} as const;

export function DetailList({
  columns = 2,
  className,
  children,
}: {
  columns?: keyof typeof DETAIL_COLUMNS;
  className?: string;
  children: ReactNode;
}) {
  return (
    <dl className={cn("grid gap-4", DETAIL_COLUMNS[columns], className)}>
      {children}
    </dl>
  );
}

/** A grey block where content will be, so the page does not jump when it arrives. */
export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-md bg-surface-muted", className)}
      {...props}
    />
  );
}

/** The shape of a list, or of a record's sections, while it loads. */
export function Loading({
  rows = 3,
  label = "Loading",
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <div className="grid gap-2" role="status" aria-label={label}>
      <Skeleton className="h-10" />
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-14" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  /** The next step, when there is one. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-line px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-3 rounded-full border border-line bg-surface p-2.5 text-muted-foreground [&_svg]:size-5">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border border-line bg-surface-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
