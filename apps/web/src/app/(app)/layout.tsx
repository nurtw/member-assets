"use client";

import { Bus, FilePlus2, LogOut, Monitor, Moon, Sun, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { AccountMenu } from "@/components/shell/account-menu";
import { AppFrame, type CommandAction } from "@/components/shell/app-frame";
import { Brand } from "@/components/shell/brand";
import { setThemeChoice } from "@/components/shell/theme";
import { Card, Notice } from "@/components/ui";
import {
  OFFICER_ACCOUNT_ITEMS,
  OFFICER_LANDING_ORDER,
  OFFICER_NAVIGATION,
  landingHref,
  visibleNavigation,
} from "@/lib/navigation";
import { SessionProvider, useSession } from "@/lib/session";

/**
 * The authenticated shell (item 32): the officers' sidebar, breadcrumbs, and
 * command menu around every screen.
 *
 * Navigation is filtered by the permissions the signed-in officer actually
 * holds — but that is a courtesy, not a control. Every route behind this shell
 * is enforced by the API's guard, which denies by default; hiding a link merely
 * avoids offering a button that would refuse.
 */
function Shell({ children }: { children: ReactNode }) {
  const { user, account, permissions, loading, holds, signOut } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const groups = user ? visibleNavigation(OFFICER_NAVIGATION, holds) : [];
  const home = user
    ? (landingHref(OFFICER_NAVIGATION, OFFICER_LANDING_ORDER, holds) ?? "/applications")
    : "/applications";

  // Signing in, and the root, land on /applications. An officer who cannot
  // read applications — a verification officer, typically — goes to the first
  // screen they can use instead of a refusal.
  useEffect(() => {
    if (user && pathname === "/applications" && home !== "/applications") {
      router.replace(home);
    }
  }, [user, pathname, home, router]);

  // Item 28 — an officer on a temporary password can use nothing until they
  // choose their own, so every screen leads to the one where they do. The API
  // refuses regardless; this only spares them a page of refusals.
  const mustChange = account?.mustChangePassword === true;
  useEffect(() => {
    if (mustChange && pathname !== "/account") {
      router.replace("/account");
    }
  }, [mustChange, pathname, router]);

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!user) {
    // The provider has already redirected; render nothing rather than a flash of
    // an empty dashboard.
    return null;
  }

  const actions: CommandAction[] = [];
  if (holds("member.create")) {
    actions.push({
      id: "new-application",
      label: "New application",
      icon: FilePlus2,
      keywords: ["register", "member", "membership"],
      run: () => router.push("/applications/new"),
    });
  }
  if (holds("vehicle.declare") || holds("vehicle.record")) {
    actions.push({
      id: "new-vehicle",
      label: holds("vehicle.declare") ? "Declare a vehicle" : "Record a vehicle",
      icon: Bus,
      keywords: ["plate", "vehicle", "record"],
      run: () => router.push("/vehicles/new"),
    });
  }
  actions.push(
    {
      id: "account",
      label: "Your account",
      icon: UserRound,
      keywords: ["password", "second factor", "authenticator"],
      run: () => router.push("/account"),
    },
    {
      id: "theme-light",
      label: "Use the light theme",
      icon: Sun,
      keywords: ["theme", "appearance"],
      run: () => setThemeChoice("light"),
    },
    {
      id: "theme-dark",
      label: "Use the dark theme",
      icon: Moon,
      keywords: ["theme", "appearance"],
      run: () => setThemeChoice("dark"),
    },
    {
      id: "theme-system",
      label: "Follow the device's theme",
      icon: Monitor,
      keywords: ["theme", "appearance", "system"],
      run: () => setThemeChoice("system"),
    },
    {
      id: "sign-out",
      label: "Sign out",
      icon: LogOut,
      keywords: ["log out", "leave"],
      run: () => void signOut(),
    },
  );

  return (
    <AppFrame
      brand={(collapsed) => (
        <Brand href={home} title="NURTW Anambra" subtitle="State Council" collapsed={collapsed} />
      )}
      groups={groups}
      extraItems={[...OFFICER_ACCOUNT_ITEMS]}
      footer={(collapsed) => (
        <AccountMenu
          name={user.fullName}
          detail={user.email}
          collapsed={collapsed}
          links={[{ href: "/account", label: "Your account", icon: UserRound }]}
          onSignOut={() => void signOut()}
        />
      )}
      actions={actions}
    >
      {account?.secondFactor.required &&
      !account.secondFactor.verified &&
      pathname !== "/account" ? (
        <Notice
          tone="caution"
          title="A second factor is needed for administrative work"
          className="mb-6"
        >
          {account.secondFactor.enrolled
            ? "Enter a code from your authenticator app to use administrative functions in this session."
            : "Set up an authenticator app to use administrative functions. Everything else works as usual."}{" "}
          <Link href="/account" className="font-medium underline underline-offset-2">
            Go to your account
          </Link>
        </Notice>
      ) : null}
      {permissions.length === 0 && !mustChange && pathname !== "/account" ? (
        // An officer with no role yet holds no permission at all, so there
        // is no screen to show. Say so, rather than render one the API
        // will refuse. Asked of the permissions, not the links: a composed
        // role may open a screen the navigation does not list.
        <Card className="max-w-xl p-6">
          <h1 className="text-lg font-semibold tracking-tight">Your account has no access yet</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You are signed in, but no role has been given to this account, so there is nothing
            here for you to open. Ask your administrator to give you a role, then sign in again.
          </p>
          <p className="mt-3 text-sm">
            <Link href="/account" className="font-medium underline underline-offset-2">
              Your account
            </Link>{" "}
            is where you change your password and set up a second factor.
          </p>
        </Card>
      ) : (
        children
      )}
    </AppFrame>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}
