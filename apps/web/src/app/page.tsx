import {
  ArrowRight,
  Building2,
  KeyRound,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ThemeButton } from "@/components/shell/theme";
import { cn } from "@/lib/cn";

/**
 * The front page: one screen that says what this is and shows the ways in
 * (the owner's direction of 5 October 2026).
 *
 * It is a door, not a directory. The System is not a public directory (PRD
 * §2.2), so nothing here looks a member or a vehicle up, and the page says so
 * in words: a front page that only looked official would invite the
 * assumption that membership can be checked here.
 *
 * An officer already signed in is sent to their home. The browser talks only
 * to this application's own origin (`next.config.ts` forwards `/api/v1`), so
 * the session cookie is this origin's, and its presence can be read here. It
 * is only ever a hint: a cookie that has expired lands on the home screen,
 * whose shell sends anyone without a session to sign in.
 */

/** The API's `SESSION_COOKIE_NAME`. */
const SESSION_COOKIE = "nurtw_session";

function WayIn({
  href,
  icon: Icon,
  title,
  text,
  primary = false,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  text: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-4 rounded-xl border p-4 transition-colors sm:flex-col sm:items-start sm:p-5",
        primary
          ? "border-primary bg-primary text-on-solid hover:bg-primary-hover"
          : "border-line bg-surface hover:border-line-strong hover:bg-surface-muted",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg border",
          primary
            ? "border-on-solid/40"
            : "border-line bg-surface-muted text-brand-text",
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-base font-semibold">
          {title}
          <ArrowRight
            className="size-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </span>
        <span
          className={cn(
            "mt-1 block text-sm",
            primary ? "text-on-solid" : "text-muted-foreground",
          )}
        >
          {text}
        </span>
      </span>
    </Link>
  );
}

export default async function FrontPage() {
  if ((await cookies()).has(SESSION_COOKIE)) {
    redirect("/overview");
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- a small, static public asset; next/image's build-time optimisation buys nothing here. */}
          <img src="/logo.png" alt="" className="size-8 object-contain" />
          <span className="leading-tight">
            <span className="block text-sm font-semibold tracking-tight">
              NURTW
            </span>
            <span className="block text-xs text-muted-foreground">
              Anambra State Council
            </span>
          </span>
        </div>
        <ThemeButton />
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-8 px-4 py-6 sm:px-6">
        <div>
          <p className="text-sm font-medium text-brand-text">
            National Union of Road Transport Workers
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">
            Membership and Vehicle Verification System
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted-foreground">
            The Union&apos;s record of its members, their vehicles, and their
            stickers. Choose where you are going.
          </p>
        </div>

        <nav aria-label="Ways in" className="grid gap-3 sm:grid-cols-3">
          <WayIn
            primary
            href="/login"
            icon={ShieldCheck}
            title="Officer sign-in"
            text="Verify, register members and vehicles, assign stickers, and take payments."
          />
          <WayIn
            href="/portal/login"
            icon={Building2}
            title="Organisation portal"
            text="For approved organisations: your usage and your API tokens."
          />
          <WayIn
            href="/portal/apply"
            icon={KeyRound}
            title="Apply for access"
            text="Ask the Union for access to its verification service."
          />
        </nav>
      </main>

      <footer className="shrink-0 px-4 pb-5 sm:px-6">
        <p className="mx-auto max-w-4xl text-xs text-faint-foreground">
          There is no public list of members or vehicles here. A verification
          confirms only that a matching NURTW record exists; it is not evidence
          of ownership, roadworthiness, licensing, or insurance.
        </p>
      </footer>
    </div>
  );
}
