"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { SessionProvider, useSession } from "@/lib/session";

/**
 * The authenticated shell.
 *
 * Navigation is filtered by the permissions the signed-in officer actually
 * holds — but that is a courtesy, not a control. Every route behind this shell
 * is enforced by the API's guard, which denies by default; hiding a link merely
 * avoids offering a button that would refuse.
 */
function Shell({ children }: { children: ReactNode }) {
  const { user, loading, holds, signOut } = useSession();
  const pathname = usePathname();

  if (loading) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center">
        <p className="text-sm text-black/50">Loading…</p>
      </div>
    );
  }

  if (!user) {
    // The provider has already redirected; render nothing rather than a flash of
    // an empty dashboard.
    return null;
  }

  const links = [
    { href: "/applications", label: "Applications", permission: "application.read" },
    { href: "/cards", label: "Cards", permission: "card.read" },
  ].filter((link) => holds(link.permission));

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-[var(--border-subtle)] bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link href="/applications" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--nurtw-green)] text-xs font-bold text-white">
              NU
            </span>
            <span className="text-sm font-semibold tracking-tight">
              NURTW Anambra
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {links.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    "rounded-md px-3 py-1.5 text-sm font-medium transition " +
                    (active
                      ? "bg-[var(--surface-muted)] text-[var(--nurtw-green-deep)]"
                      : "text-black/65 hover:bg-[var(--surface-muted)]")
                  }
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-black/60 sm:inline">
              {user.fullName}
            </span>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-sm font-medium transition hover:bg-[var(--surface-muted)]"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>

      <footer className="border-t border-[var(--border-subtle)] px-4 py-4">
        <p className="mx-auto max-w-6xl text-xs text-black/45">
          National Union of Road Transport Workers, Anambra State Council.
          Activity on this System is recorded.
        </p>
      </footer>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}
