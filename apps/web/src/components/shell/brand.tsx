import Link from "next/link";

import { cn } from "@/lib/cn";

/** The Union's emblem, on white, and a name, at the head of a sidebar. */
export function Brand({
  href,
  title,
  subtitle,
  collapsed = false,
}: {
  href: string;
  title: string;
  subtitle?: string;
  collapsed?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex min-w-0 items-center gap-2.5 rounded-md p-1 transition-colors hover:bg-surface-muted",
        collapsed && "justify-center",
      )}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-paper shadow-card ring-1 ring-line">
        {/* The emblem is a steering wheel; pointing at it turns the wheel. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- a small, static public asset; next/image's build-time optimisation buys nothing here. */}
        <img
          src="/logo.png"
          alt=""
          className="size-6 object-contain transition-transform duration-500 group-hover:-rotate-[20deg]"
        />
      </span>
      {collapsed ? (
        <span className="sr-only">{title}</span>
      ) : (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold tracking-tight">
            {title}
          </span>
          {subtitle ? (
            <span className="block truncate text-xs text-muted-foreground">
              {subtitle}
            </span>
          ) : null}
        </span>
      )}
    </Link>
  );
}
