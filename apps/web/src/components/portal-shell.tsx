import type { ReactNode } from "react";

/**
 * The frame of the organisation portal's public pages: applying and signing
 * in (item 29). Plainly not the officers' sign-in, so nobody mistakes one for
 * the other.
 */
export function PortalFrame({
  title,
  children,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <main className="flex min-h-full flex-1 items-start justify-center bg-[var(--surface-muted)] px-4 py-10">
      <div className={`w-full ${wide ? "max-w-xl" : "max-w-sm"}`}>
        <div className="mb-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- a small, static public asset; next/image's build-time optimisation buys nothing here. */}
          <img
            src="/logo.png"
            alt="NURTW emblem"
            className="mx-auto mb-3 h-14 w-14 object-contain"
          />
          <p className="text-xs font-medium uppercase tracking-wide text-black/50">
            NURTW Anambra State Council · Organisation portal
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{title}</h1>
        </div>
        {children}
      </div>
    </main>
  );
}
