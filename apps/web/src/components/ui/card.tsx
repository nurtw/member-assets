import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

/** A bordered panel on the page's surface. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg border border-line bg-surface", className)}
      {...props}
    />
  );
}

/** A titled section of a form or page: a card with a heading. */
export function Section({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  /** Beside the heading: the section's own action. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}
