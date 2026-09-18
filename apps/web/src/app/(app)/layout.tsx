"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

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
  const [menuOpen, setMenuOpen] = useState(false);

  // A route change is a navigation the officer just chose; leaving the menu
  // open over the new page would cover it. Adjusted during render, not an
  // effect — React docs' "adjusting state when a prop changes" pattern:
  // comparing against a value tracked in state lets this reset happen before
  // the menu-open paint commits, rather than flashing open-then-closed
  // across two renders the way a `useEffect` would.
  const [menuClosedFor, setMenuClosedFor] = useState(pathname);
  if (pathname !== menuClosedFor) {
    setMenuClosedFor(pathname);
    setMenuOpen(false);
  }

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
            {/* eslint-disable-next-line @next/next/no-img-element -- a small, static public asset; next/image's build-time optimisation buys nothing here. */}
            <img src="/logo.png" alt="NURTW emblem" className="h-8 w-8 object-contain" />
            <span className="text-sm font-semibold tracking-tight">
              NURTW Anambra
            </span>
          </Link>

          {/* Below `sm`, the links, the officer's name, and Sign out move into
              the collapsible panel below — inline they either wrapped onto a
              second line or ran under the logo, depending on name length. */}
          <nav className="hidden items-center gap-1 sm:flex">
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

          <div className="ml-auto hidden items-center gap-3 sm:flex">
            <span className="text-sm text-black/60">{user.fullName}</span>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-sm font-medium transition hover:bg-[var(--surface-muted)]"
            >
              Sign out
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border-subtle)] sm:hidden"
          >
            <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
            {menuOpen ? (
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden>
                <path d="M4 4l12 12M16 4 4 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden>
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>

        {menuOpen ? (
          <div className="border-t border-[var(--border-subtle)] px-4 py-3 sm:hidden">
            <nav className="flex flex-col gap-1">
              {links.map((link) => {
                const active = pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={
                      "rounded-md px-3 py-2 text-sm font-medium transition " +
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
            <div className="mt-3 flex items-center justify-between border-t border-[var(--border-subtle)] pt-3">
              <span className="text-sm text-black/60">{user.fullName}</span>
              <button
                type="button"
                onClick={() => void signOut()}
                className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-sm font-medium transition hover:bg-[var(--surface-muted)]"
              >
                Sign out
              </button>
            </div>
          </div>
        ) : null}
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
