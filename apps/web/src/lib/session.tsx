"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import useSWR, { mutate } from "swr";

import { ApiError, api, fetcher } from "./api";

export interface ScopedPermission {
  permission: string;
  scopePath: string;
}

export interface SignedInUser {
  id: string;
  email: string;
  fullName: string;
}

interface MeResponse {
  user: SignedInUser;
  permissions: ScopedPermission[];
}

interface SessionValue {
  user: SignedInUser | null;
  permissions: ScopedPermission[];
  loading: boolean;
  /**
   * Whether the officer holds a permission anywhere.
   *
   * **For hiding controls, never for authorising anything.** The API's guard is
   * the authority; this only avoids offering a button that will refuse. A screen
   * that hid a control and skipped the server check would be a screen whose
   * security could be bypassed with developer tools.
   *
   * Note "anywhere": an officer may hold a permission in one unit and not
   * another, so a visible control is not a promise that this particular record
   * will accept it.
   */
  holds: (permission: string) => boolean;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

/**
 * The signed-in officer.
 *
 * Fetched through SWR rather than a hand-written effect. Beyond deduplicating
 * the request across every component that asks, it keeps the fetch out of an
 * effect body entirely — which is what the React compiler asks for, and it
 * removes the loading/error state machine that each screen would otherwise
 * reimplement slightly differently.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  const { data, error, isLoading } = useSWR<MeResponse>(
    "/auth/me",
    fetcher<MeResponse>,
    {
      shouldRetryOnError: false,
      revalidateOnFocus: true,
    },
  );

  // Only an authentication failure means "sign in". A network fault must not
  // bounce an officer to a login screen their credentials cannot fix.
  const unauthenticated = error instanceof ApiError && error.status === 401;

  useEffect(() => {
    if (unauthenticated) {
      router.replace("/login");
    }
  }, [unauthenticated, router]);

  const value = useMemo<SessionValue>(() => {
    const permissions = data?.permissions ?? [];
    return {
      user: data?.user ?? null,
      permissions,
      loading: isLoading,
      holds: (permission: string) =>
        permissions.some((entry) => entry.permission === permission),
      signOut: async () => {
        await api.post("/auth/logout").catch(() => undefined);
        // Same reasoning as the login page's `mutate` call, in reverse: leave
        // no stale authenticated `/auth/me` in the shared SWR cache for the
        // next sign-in to flash before its own revalidation lands.
        await mutate("/auth/me", undefined, { revalidate: false });
        router.replace("/login");
      },
    };
  }, [data, isLoading, router]);

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used within a SessionProvider.");
  }
  return value;
}
