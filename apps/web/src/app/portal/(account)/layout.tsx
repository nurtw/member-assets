"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { PortalSessionProvider, usePortalSession } from "@/lib/portal-session";

const LINKS = [
  { href: "/portal", label: "Overview" },
  { href: "/portal/account", label: "Account" },
];

/**
 * The signed-in organisation portal (item 29). Its own shell, its own session:
 * nothing of the officers' dashboard is mounted here.
 */
export default function PortalAccountLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <PortalSessionProvider>
      <Shell>{children}</Shell>
    </PortalSessionProvider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { me, loading, signOut } = usePortalSession();
  const pathname = usePathname();
  const router = useRouter();

  // A password the administrator gave opens nothing else until it is changed.
  const mustChange = me?.account.mustChangePassword === true;
  useEffect(() => {
    if (mustChange && pathname !== "/portal/account") {
      router.replace("/portal/account");
    }
  }, [mustChange, pathname, router]);

  if (!me) {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center bg-[var(--surface-muted)]">
        <p className="text-sm text-black/50">
          {loading ? "Loading…" : "Signing you in…"}
        </p>
      </main>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-[var(--surface-muted)]">
      <header className="border-b border-[var(--border-subtle)] bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/portal" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- a small, static public asset; next/image's build-time optimisation buys nothing here. */}
            <img src="/logo.png" alt="" className="h-8 w-8 object-contain" />
            <span className="text-sm font-semibold leading-tight">
              NURTW organisation portal
              <span className="block text-xs font-normal text-black/55">
                {me.organisation.name}
              </span>
            </span>
          </Link>
          <nav className="flex flex-1 gap-1" aria-label="Portal">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
                className={
                  "rounded-md px-3 py-1.5 text-sm font-medium " +
                  (pathname === link.href
                    ? "bg-[var(--surface-muted)] text-[var(--foreground)]"
                    : "text-black/60 hover:text-[var(--foreground)]")
                }
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-black/60">{me.account.fullName}</span>
            <button
              type="button"
              onClick={() => void signOut()}
              className="font-medium underline underline-offset-2"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
