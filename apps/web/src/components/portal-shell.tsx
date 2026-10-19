import Link from "next/link";
import type { ReactNode } from "react";

import {
  EmblemBadge,
  PublicBackdrop,
  UnionRule,
} from "@/components/shell/identity";

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
    <main className="relative isolate flex min-h-full flex-1 items-start justify-center px-4 py-10">
      <PublicBackdrop id="portal-network" />
      <div
        className={`w-full animate-rise-in ${wide ? "max-w-xl" : "max-w-sm"}`}
      >
        <div className="mb-6 text-center">
          <EmblemBadge className="mb-3" />
          <p className="text-xs font-medium uppercase tracking-wide text-faint-foreground">
            NURTW Anambra State Council · Organisation portal
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{title}</h1>
          <UnionRule className="mt-3 justify-center" />
        </div>
        {children}
        <p className="mt-6 text-center text-xs text-faint-foreground">
          How the verification API works:{" "}
          <Link href="/docs" className="underline underline-offset-2">
            the API documentation
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
