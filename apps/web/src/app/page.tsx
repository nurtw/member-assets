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

import {
  CardBands,
  EmblemRoundabout,
  PublicBackdrop,
  RoadStrip,
  SteeringWheel,
  UnionRule,
} from "@/components/shell/identity";
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
        "group relative flex items-center gap-4 overflow-hidden rounded-2xl border p-4 shadow-card transition-[transform,box-shadow,background-color,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-lift sm:flex-col sm:items-start sm:p-5",
        primary
          ? // The deeper green, so its words keep AA over the lattice.
            "border-nurtw-green-deep bg-nurtw-green-deep text-on-solid hover:border-primary"
          : "border-line bg-surface/85 backdrop-blur hover:border-line-strong",
      )}
    >
      {/* The diamond lattice in the corner: always on the filled way in, on
          hover on the others. */}
      <span
        aria-hidden
        className={cn(
          "fade-corner absolute inset-0 transition-opacity duration-300",
          primary ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      >
        <span
          className={cn(
            "absolute inset-0 pattern-diamond",
            primary && "ink-on-solid",
          )}
        />
      </span>
      <span
        className={cn(
          "relative flex size-11 shrink-0 items-center justify-center rounded-xl border transition-transform duration-300 group-hover:-rotate-6",
          primary
            ? "border-on-solid/40 bg-on-solid/10"
            : "border-line bg-surface-muted text-brand-text",
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-base font-semibold">
          {title}
          <ArrowRight
            className="size-4 transition-transform duration-200 group-hover:translate-x-1"
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
    <div className="relative isolate flex min-h-dvh flex-1 flex-col lg:px-9">
      <PublicBackdrop id="front-network" />
      <CardBands />

      <header className="flex h-16 shrink-0 items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-paper shadow-card ring-1 ring-line">
            {/* eslint-disable-next-line @next/next/no-img-element -- a small, static public asset; next/image's build-time optimisation buys nothing here. */}
            <img src="/logo.png" alt="" className="size-7 object-contain" />
          </span>
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

      <main className="mx-auto grid w-full max-w-6xl flex-1 content-center items-center gap-8 px-4 py-6 sm:px-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-x-12">
        <div className="animate-rise-in">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1 text-xs font-medium text-brand-text shadow-card backdrop-blur">
            <SteeringWheel className="size-3.5 animate-steer-once" />
            National Union of Road Transport Workers
          </p>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Membership and{" "}
            <span className="bg-linear-to-r from-brand-text to-link bg-clip-text text-transparent forced-colors:bg-none forced-colors:text-[CanvasText]">
              Vehicle Verification
            </span>{" "}
            System
          </h1>
          <UnionRule className="mt-5" />
          <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
            The Union&apos;s record of its members, their vehicles, and their
            stickers. Choose where you are going.
          </p>
        </div>

        <div className="hidden justify-center lg:flex">
          <EmblemRoundabout size={320} />
        </div>

        <nav
          aria-label="Ways in"
          className="grid gap-3 sm:grid-cols-3 lg:col-span-2"
        >
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

      <footer className="shrink-0">
        <p className="mx-auto max-w-6xl px-4 pb-4 text-xs text-faint-foreground sm:px-8">
          There is no public list of members or vehicles here. A verification
          confirms only that a matching NURTW record exists; it is not evidence
          of ownership, roadworthiness, licensing, or insurance.
        </p>
        <RoadStrip />
      </footer>
    </div>
  );
}
