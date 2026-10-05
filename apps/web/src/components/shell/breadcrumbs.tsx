import Link from "next/link";

import type { Crumb } from "@/lib/navigation";

/** Where the page sits: its group, its screen, and anything beneath that. */
export function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  if (trail.length === 0) {
    return null;
  }
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {trail.map((crumb, index) => {
          const last = index === trail.length - 1;
          return (
            <li
              key={`${crumb.label}-${index}`}
              className="flex min-w-0 items-center gap-1.5"
            >
              {index > 0 ? (
                <span aria-hidden className="text-faint-foreground">
                  /
                </span>
              ) : null}
              {crumb.href && !last ? (
                <Link
                  href={crumb.href}
                  className="truncate text-muted-foreground transition-colors hover:text-foreground"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={
                    last
                      ? "truncate font-medium text-foreground"
                      : "truncate text-muted-foreground"
                  }
                >
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
