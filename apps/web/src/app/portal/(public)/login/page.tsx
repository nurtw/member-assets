"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { mutate } from "swr";

import { PortalFrame } from "@/components/portal-shell";
import { Button, ErrorNotice, Field, TextInput } from "@/components/ui";
import { ApiError, api } from "@/lib/api";

/**
 * Sign-in to the organisation portal (item 29).
 *
 * As with the officers' sign-in, there is one message for a failed attempt:
 * it names neither the address nor the password, because the API answers an
 * unknown account, a wrong password, and a locked account alike.
 */
export default function PortalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/portal/login", { email, password });
      // Whoever last mounted the portal left a cached 401 at this key.
      await mutate("/portal/me");
      router.replace("/portal");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "The service could not be reached."),
      );
      setBusy(false);
    }
  }

  return (
    <PortalFrame title="Sign in">
      <form
        onSubmit={submit}
        className="grid gap-4 rounded-lg border border-line bg-surface p-6"
      >
        {error ? (
          <ErrorNotice
            message={
              error.status === 401
                ? "Those details were not accepted. After several failed tries an account is locked for a while."
                : error.message
            }
            requestId={error.requestId}
          />
        ) : null}
        <Field label="Work email" htmlFor="email" required>
          <TextInput
            id="email"
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
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="mt-5 text-center text-xs leading-relaxed text-faint-foreground">
        Not yet applied?{" "}
        <Link href="/portal/apply" className="underline underline-offset-2">
          Apply for API access
        </Link>
        . Forgotten your password? Telephone the Union&apos;s API administrator,
        who can give you a temporary one.
      </p>
    </PortalFrame>
  );
}
