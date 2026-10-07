"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { mutate } from "swr";

import { ApiWakeNotice, useApiWake } from "@/components/api-wake";
import { Button, ErrorNotice, Field, Notice, TextInput } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import {
  SIGN_IN_LIMIT_MS,
  SLOW_TO_OPEN_MS,
  settled,
  wasNotThere,
} from "@/lib/sign-in";

/**
 * Officer sign-in.
 *
 * The API answers identically for an unknown account and an incorrect password,
 * and takes comparable time over both. This screen must not undo that: there is
 * one message for a failed attempt, it names neither the address nor the
 * password, and it does not clear one field and keep the other — which would
 * itself say which one was wrong.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Asked for only once the API says the account has a second factor, which
  // it says only after accepting the password (item 28).
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // The password was accepted and the next screen is being opened. The button
  // stays busy from here until this page is gone (item 41): on a slow
  // connection it used to read "Sign in" again while the next screen loaded,
  // which looked as if nothing had happened, and officers signed in twice.
  const [opening, setOpening] = useState(false);
  const [slowToOpen, setSlowToOpen] = useState(false);
  // Asks the API for a sign of life as soon as the page opens, which is what
  // starts it if its host has put it to sleep.
  const wake = useApiWake();

  useEffect(() => {
    if (!opening) {
      return;
    }
    const timer = setTimeout(() => setSlowToOpen(true), SLOW_TO_OPEN_MS);
    return () => clearTimeout(timer);
  }, [opening]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await api.post(
        "/auth/login",
        {
          email,
          password,
          ...(needsCode && code.trim() ? { code: code.trim() } : {}),
        },
        // A stalled connection ends with a message. Nothing retries by itself.
        { timeoutMs: SIGN_IN_LIMIT_MS },
      );
      // `/auth/me` is a global SWR cache key: whoever last mounted the
      // authenticated shell (typically the pre-login redirect through
      // `/applications`) left a cached 401 there. `SessionProvider` would
      // serve that stale error the instant it remounts and bounce straight
      // back here before its own revalidation finished — which read as "the
      // first sign-in just refreshed the page." Revalidating the key here,
      // before navigating, means the shell mounts onto fresh, authenticated
      // data instead.
      //
      // The wait is bounded. If it runs out, the stale answer is cleared, so
      // the shell asks for itself and shows its own loading state.
      if (!(await settled(mutate("/auth/me"), SIGN_IN_LIMIT_MS))) {
        await mutate("/auth/me", undefined, { revalidate: false });
      }
      setOpening(true);
      router.replace("/overview");
      return;
    } catch (caught) {
      const failure =
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "The service could not be reached.");
      const codeProblem = failure.fieldError("code");
      if (codeProblem && !needsCode) {
        // The password was accepted; ask for the code and say nothing failed.
        setNeedsCode(true);
        setError(null);
      } else {
        setError(failure);
      }
    }
    // Reached only when signing in did not succeed: a success returns above
    // and leaves the button busy.
    setSubmitting(false);
  }

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-surface-muted px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- a small, static public asset; next/image's build-time optimisation buys nothing here. */}
          <img
            src="/logo.png"
            alt="NURTW emblem"
            className="mx-auto mb-4 h-14 w-14 object-contain"
          />
          <h1 className="text-xl font-semibold tracking-tight">
            NURTW Membership System
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Anambra State Council</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="grid gap-4 rounded-lg border border-line bg-surface p-6"
        >
          <ApiWakeNotice wake={wake} />

          {error ? (
            <ErrorNotice
              message={
                error.fieldError("code") ??
                (error.status === 401
                  ? "Those credentials were not accepted."
                  : error.status === 503
                    ? "Your second factor cannot be checked at present. Tell the administrator."
                    : // A gateway answering for a server that is not up yet.
                      // Nothing was wrong with what was typed.
                      wasNotThere(error.status) && error.status !== 0
                      ? "The System was still starting up. Wait a moment, then sign in again."
                      : error.message)
              }
              requestId={error.requestId}
            />
          ) : null}

          <Field label="Official email address" htmlFor="email" required>
            <TextInput
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>

          <Field label="Password" htmlFor="password" required>
            <div className="relative">
              <TextInput
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                tabIndex={-1}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-faint-foreground hover:text-muted-foreground"
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </Field>

          {needsCode ? (
            <Field
              label="Authenticator code"
              htmlFor="code"
              required
              hint="The six-digit code from your authenticator app, or one of your recovery codes."
            >
              <TextInput
                id="code"
                name="code"
                inputMode="text"
                autoComplete="one-time-code"
                autoFocus
                required
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </Field>
          ) : null}

          <Button type="submit" disabled={submitting}>
            {opening
              ? "Opening…"
              : submitting
                ? "Signing in…"
                : needsCode
                  ? "Verify and sign in"
                  : "Sign in"}
          </Button>

          {slowToOpen ? (
            <Notice tone="info" title="You are signed in" role="status">
              The next screen is slow to open on this connection. There is no
              need to sign in again.{" "}
              {/* A plain link: a full page load, if the quick one has stalled. */}
              <a
                href="/overview"
                className="font-medium underline underline-offset-2"
              >
                Open it now
              </a>
            </Notice>
          ) : null}
        </form>

        <p className="mt-6 text-center text-xs leading-relaxed text-faint-foreground">
          Access is restricted to authorised officers of the Union. Activity on
          this System is recorded.
        </p>
        <p className="mt-2 text-center text-xs text-faint-foreground">
          An outside organisation?{" "}
          <Link href="/portal/login" className="underline underline-offset-2">
            Use the organisation portal
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4.5 w-4.5" aria-hidden>
      <path
        d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4.5 w-4.5" aria-hidden>
      <path
        d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 17 17 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
