"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button, ErrorNotice, Field, TextInput } from "@/components/ui";
import { ApiError, api } from "@/lib/api";

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
  const [error, setError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await api.post("/auth/login", { email, password });
      router.replace("/applications");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "The service could not be reached."),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-[var(--surface-muted)] px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* The Union's identity, in the Union's colours. */}
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--nurtw-green)] text-lg font-bold tracking-tight text-white">
            NU
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            NURTW Membership System
          </h1>
          <p className="mt-1 text-sm text-black/60">Anambra State Council</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="grid gap-4 rounded-lg border border-[var(--border-subtle)] bg-white p-6"
        >
          {error ? (
            <ErrorNotice
              message={
                error.status === 401
                  ? "Those credentials were not accepted."
                  : error.message
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
            <TextInput
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>

          <Button type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs leading-relaxed text-black/50">
          Access is restricted to authorised officers of the Union. Activity on
          this System is recorded.
        </p>
      </div>
    </main>
  );
}
