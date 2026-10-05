"use client";

import type { PortalMe } from "@nurtw/contracts";
import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import useSWR, { mutate } from "swr";

import { ApiError, api, fetcher } from "./api";

interface PortalSessionValue {
  me: PortalMe | null;
  loading: boolean;
  /** Re-reads the organisation's standing, after something changed it. */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const PortalSessionContext = createContext<PortalSessionValue | null>(null);

/**
 * The signed-in portal account (item 29).
 *
 * A separate provider from the officers' `SessionProvider`, over a separate
 * cookie and a separate route. The two are never mounted together: an
 * organisation's account is not a kind of officer, and nothing here knows
 * about permissions.
 */
export function PortalSessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data, error, isLoading } = useSWR<PortalMe>(
    "/portal/me",
    fetcher<PortalMe>,
    { shouldRetryOnError: false, revalidateOnFocus: true },
  );

  // Only an authentication failure means "sign in": a network fault must not
  // send somebody to a form their password cannot fix.
  const unauthenticated = error instanceof ApiError && error.status === 401;
  useEffect(() => {
    if (unauthenticated) {
      router.replace("/portal/login");
    }
  }, [unauthenticated, router]);

  const value = useMemo<PortalSessionValue>(
    () => ({
      me: data ?? null,
      loading: isLoading,
      refresh: async () => {
        await mutate("/portal/me");
      },
      signOut: async () => {
        await api.post("/portal/logout");
        await mutate("/portal/me", undefined, { revalidate: false });
        router.replace("/portal/login");
      },
    }),
    [data, isLoading, router],
  );

  return (
    <PortalSessionContext.Provider value={value}>
      {children}
    </PortalSessionContext.Provider>
  );
}

export function usePortalSession(): PortalSessionValue {
  const value = useContext(PortalSessionContext);
  if (!value) {
    throw new Error(
      "usePortalSession must be used inside PortalSessionProvider",
    );
  }
  return value;
}
