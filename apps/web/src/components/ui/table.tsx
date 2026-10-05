import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/**
 * A data table in a bordered frame.
 *
 * On a narrow screen it either scrolls sideways inside its frame, or, with
 * `stacked`, turns each row into a small card: the first cell leads as the
 * row's name, and each other cell shows its column's name beside its value
 * (`TableCell`'s `label`). The rules are `.stacked-table` in `globals.css`.
 *
 * The roles are stated, because a table whose rows are laid out as blocks is
 * otherwise no longer announced as one.
 */
export function Table({
  className,
  stacked = false,
  ...props
}: HTMLAttributes<HTMLTableElement> & { stacked?: boolean }) {
  return (
    <div
      className={cn(
        "relative w-full rounded-lg border border-line bg-surface",
        stacked ? "sm:overflow-x-auto" : "overflow-x-auto",
      )}
    >
      <table
        role="table"
        className={cn("w-full text-sm", stacked && "stacked-table", className)}
        {...props}
      />
    </div>
  );
}

export function TableHead({
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      role="rowgroup"
      className={cn(
        "border-b border-line bg-surface-muted text-left text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function TableBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody role="rowgroup" {...props} />;
}

export function TableRow({
  className,
  ...props
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      role="row"
      className={cn(
        "border-b border-line last:border-0 hover:bg-surface-muted/60",
        className,
      )}
      {...props}
    />
  );
}

export function TableHeader({
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      role="columnheader"
      className={cn("px-4 py-2.5 text-xs font-medium", className)}
      {...props}
    />
  );
}

export function TableCell({
  className,
  label,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & {
  /** The column's name, shown beside the value when the table is stacked. */
  label?: string;
}) {
  return (
    <td
      role="cell"
      data-label={label}
      className={cn("px-4 py-3 align-top", className)}
      {...props}
    />
  );
}
