"use client";

import { UserRound } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { AccountMenu } from "@/components/shell/account-menu";
import { AppFrame } from "@/components/shell/app-frame";
import { Brand } from "@/components/shell/brand";
import { PORTAL_NAVIGATION } from "@/lib/navigation";
import { PortalSessionProvider, usePortalSession } from "@/lib/portal-session";

/**
 * The signed-in organisation portal (item 29), in the same frame as the
 * officers' dashboard (item 32) but with its own navigation, its own session,
 * and no command menu: nothing of the officers' dashboard is mounted here.
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

  // An account on a temporary password can do nothing until it chooses its
  // own, so every page leads to the one where it does.
  const mustChange = me?.account.mustChangePassword === true;
  useEffect(() => {
    if (mustChange && pathname !== "/portal/account") {
      router.replace("/portal/account");
    }
  }, [mustChange, pathname, router]);

  if (!me) {
    return (
      <main className="flex min-h-dvh flex-1 items-center justify-center bg-surface-muted">
        <p className="text-sm text-muted-foreground">
          {loading ? "Loading…" : "Signing you in…"}
        </p>
      </main>
    );
  }

  return (
    <AppFrame
      brand={(collapsed) => (
        <Brand
          href="/portal"
          title="Organisation portal"
          subtitle={me.organisation.name}
          collapsed={collapsed}
        />
      )}
      groups={[...PORTAL_NAVIGATION]}
      footer={(collapsed) => (
        <AccountMenu
          name={me.account.fullName}
          detail={me.organisation.name}
          collapsed={collapsed}
          links={[
            { href: "/portal/account", label: "Account", icon: UserRound },
          ]}
          onSignOut={() => void signOut()}
        />
      )}
      search={false}
    >
      {children}
    </AppFrame>
  );
}
