"use client";

import type { ReactNode } from "react";
import { SWRConfig } from "swr";

import { SWR_DEFAULTS } from "@/lib/swr-defaults";

/** Applies `SWR_DEFAULTS` to every read beneath it. See `lib/swr-defaults.ts`. */
export function SwrDefaults({ children }: { children: ReactNode }) {
  return <SWRConfig value={SWR_DEFAULTS}>{children}</SWRConfig>;
}
