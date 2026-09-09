"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ApiError, api } from "./api";

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
   * Whether the user holds a permission anywhere.
   *
   * **For hiding controls, never for authorising anything.** The guard on the
   * API is the authority; this only avoids offering a button that will refuse.
   * A screen that hid a control and skipped the server check would be a screen
   * whose security could be bypassed with developer tools.
   */
  holds: (permission: string) => boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SignedInUser | null>(null);
  const [permissions, setPermissions] = useState<ScopedPermission[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const me = await api.get<MeResponse>("/auth/me");
      setUser(me.user);
      setPermissions(me.permissions);
    } catch (error) {
      setUser(null);
      setPermissions([]);
      // Only an authentication failure means "sign in"; a network fault must not
      // bounce someone to a login screen their credentials cannot fix.
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login");
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const signOut = useCallback(async () => {
    await api.post("/auth/logout").catch(() => undefined);
    setUser(null);
    setPermissions([]);
    router.replace("/login");
  }, [router]);

  const value = useMemo<SessionValue>(
    () => ({
      user,
      permissions,
      loading,
      holds: (permission: string) =>
        permissions.some((entry) => entry.permission === permission),
      signOut,
      refresh: load,
    }),
    [user, permissions, loading, signOut, load],
  );

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
