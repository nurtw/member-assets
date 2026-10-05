"use client";

import { portalApplicationSchema } from "@nurtw/contracts";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { PortalFrame } from "@/components/portal-shell";
import {
  Button,
  ErrorNotice,
  Field,
  TextArea,
  TextInput,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";

/**
 * An outside organisation applies for access (PRD §23.23, revision 1.9;
 * EXT-20 — item 29).
 *
 * The page promises nothing: an application does nothing until the Union's
 * API administrator has confirmed who sent it and approved it. The answer
 * shown afterwards is the same for every application, so the form does not
 * reveal which addresses already hold an account.
 */
export default function PortalApplyPage() {
  const [form, setForm] = useState({
    organisationName: "",
    businessPurpose: "",
    contactName: "",
    email: "",
    phone: "",
    password: "",
  });
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [received, setReceived] = useState(false);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFailure(null);
    // The same schema the API applies, so a mistake is caught before it is sent.
    const parsed = portalApplicationSchema.safeParse(form);
    if (!parsed.success) {
      const found: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "");
        found[field] ??= issue.message;
      }
      setIssues(found);
      return;
    }
    setIssues({});
    setBusy(true);
    try {
      await api.post("/portal/applications", parsed.data);
      setReceived(true);
    } catch (caught) {
      const problem =
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "The service could not be reached.");
      setIssues(
        Object.fromEntries(
          problem.details.map((detail) => [detail.field, detail.message]),
        ),
      );
      setFailure(
        problem.status === 429
          ? new ApiError(
              429,
              "Applications are not being taken from this connection just now. Please try again later.",
              problem.requestId,
            )
          : problem,
      );
    } finally {
      setBusy(false);
    }
  }

  if (received) {
    return (
      <PortalFrame title="Application received" wide>
        <div className="grid gap-3 rounded-lg border border-line bg-surface p-6 text-sm">
          <p>
            Thank you. Your application does nothing yet: the Union&apos;s API
            administrator decides every application.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              The administrator will telephone you, or write to your
              organisation, to confirm who applied.
            </li>
            <li>
              Access needs a signed data-sharing agreement with the Union. The
              administrator will tell you how to arrange one.
            </li>
            <li>
              Once approved, you sign in here to create your API token and see
              your usage.
            </li>
          </ol>
          <p className="text-muted-foreground">
            An application that is not approved within 30 days lapses, and you
            may apply again.
          </p>
          <div>
            <Link
              href="/portal/login"
              className="font-semibold underline underline-offset-2"
            >
              Sign in to see where it stands
            </Link>
          </div>
        </div>
      </PortalFrame>
    );
  }

  return (
    <PortalFrame title="Apply for API access" wide>
      <form
        onSubmit={submit}
        noValidate
        className="grid gap-4 rounded-lg border border-line bg-surface p-6"
      >
        <p className="text-sm text-muted-foreground">
          For organisations that need to check vehicles or memberships against
          the Union&apos;s records. The Union approves each one, and decides
          what it may ask and see.
        </p>
        {failure && failure.details.length === 0 ? (
          <ErrorNotice
            message={failure.message}
            requestId={failure.requestId}
          />
        ) : null}

        <Field
          label="Organisation"
          htmlFor="organisationName"
          required
          error={issues.organisationName}
        >
          <TextInput
            id="organisationName"
            autoComplete="organization"
            value={form.organisationName}
            onChange={(event) => set("organisationName")(event.target.value)}
          />
        </Field>
        <Field
          label="What the access is for"
          htmlFor="businessPurpose"
          hint="Who will make the checks, and why."
          required
          error={issues.businessPurpose}
        >
          <TextArea
            id="businessPurpose"
            value={form.businessPurpose}
            onChange={(event) => set("businessPurpose")(event.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Your name"
            htmlFor="contactName"
            required
            error={issues.contactName}
          >
            <TextInput
              id="contactName"
              autoComplete="name"
              value={form.contactName}
              onChange={(event) => set("contactName")(event.target.value)}
            />
          </Field>
          <Field
            label="Telephone"
            htmlFor="phone"
            hint="The Union telephones to confirm the application."
            required
            error={issues.phone}
          >
            <TextInput
              id="phone"
              type="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={(event) => set("phone")(event.target.value)}
            />
          </Field>
        </div>
        <Field
          label="Work email"
          htmlFor="email"
          hint="You will sign in to the portal with it."
          required
          error={issues.email}
        >
          <TextInput
            id="email"
            type="email"
            autoComplete="username"
            value={form.email}
            onChange={(event) => set("email")(event.target.value)}
          />
        </Field>
        <Field
          label="Choose a password"
          htmlFor="password"
          hint="At least 12 characters. Not your name or email address."
          required
          error={issues.password}
        >
          <TextInput
            id="password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(event) => set("password")(event.target.value)}
          />
        </Field>

        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send the application"}
        </Button>
        <p className="text-xs leading-relaxed text-faint-foreground">
          Already applied?{" "}
          <Link href="/portal/login" className="underline underline-offset-2">
            Sign in
          </Link>
          . What you enter is kept by the Union and used to decide the
          application and to contact you about it.
        </p>
      </form>
    </PortalFrame>
  );
}
