"use client";

import { ArrowRight, Check, Copy, Download, Lock, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import useSWR from "swr";

import {
  CardBands,
  PublicBackdrop,
  RoadStrip,
  SteeringWheel,
  UnionLoader,
  UnionRule,
} from "@/components/shell/identity";
import { ThemeButton } from "@/components/shell/theme";
import { Notice, Select, TextInput, buttonVariants } from "@/components/ui";
import { fetcher } from "@/lib/api";
import {
  READ_INTERNAL_DOCS,
  accessLabel,
  byArea,
  exampleBody,
  matchesSearch,
  operationsOf,
  type Access,
  type DocField,
  type DocOperation,
  type OpenApiDocument,
} from "@/lib/api-docs";
import { cn } from "@/lib/cn";

/**
 * The public docs page (item 54, the owner's direction of 19 October 2026).
 *
 * Anyone may read it: how an approved organisation uses the verification API.
 * Its words are what `docs/reference/API.md` already gives integrators, and
 * its routes come from the API's public integration reference, so the page
 * cannot describe a route that does not exist.
 *
 * **The page holds nothing sensitive.** The whole map of routes, with what each
 * requires, is fetched only for a session that holds `docs.read_internal` (the
 * super administrator, and whoever they grant it to), and the API checks that
 * again before it answers. A visitor's browser never receives it, so there is
 * nothing in this code to find.
 */

interface MeResponse {
  permissions: { permission: string }[];
}

const SECTIONS = [
  ["overview", "What a match means"],
  ["access", "Getting access"],
  ["authentication", "Authentication"],
  ["request-ids", "Request ids"],
  ["endpoints", "Endpoints"],
  ["answers", "Answers"],
  ["totals", "Vehicle totals"],
  ["errors", "Errors"],
  ["limits", "Limits and pauses"],
  ["obligations", "Your obligations"],
  ["versioning", "Versioning"],
] as const;

const MATCH_EXAMPLE = `{
  "request_id": "8f3e0d9e-7f5c-4e0c-a4b1-5b9a0fcb6b5e",
  "result": "MATCH_FOUND",
  "record_type": "NURTW_VEHICLE",
  "statement": "A matching NURTW vehicle record was found under the requested verification criteria.",
  "plate_number": "ABC-123-XY",
  "vehicle_category": "Shuttle bus",
  "sticker_status": "ACTIVE",
  "limitation": "A match confirms only that an NURTW record exists under the criteria checked. It is not evidence of ownership, roadworthiness, licensing, or insurance.",
  "verified_at": "2026-10-03T12:00:00.000Z",
  "data_as_of": "2026-10-03T12:00:00.000Z"
}`;

const NO_MATCH_EXAMPLE = `{
  "request_id": "…",
  "result": "NO_MATCH_FOUND",
  "statement": "No matching NURTW record was found under the requested verification criteria.",
  "limitation": "…",
  "verified_at": "…",
  "data_as_of": "…"
}`;

const ERROR_EXAMPLE = `{
  "error": {
    "code": "BAD_REQUEST",
    "message": "The request could not be processed.",
    "requestId": "5f1c2a90-8f1e-4a0a-9c3a-2a0d6b7c1e44",
    "details": [{ "field": "plate_number", "message": "…" }]
  }
}`;

const TOTAL_EXAMPLE = `{
  "request_id": "…",
  "result": "AGGREGATE_ONLY",
  "filters_applied": { "zone_id": "…", "period": "2026-Q3" },
  "totals": { "vehicle_count": 1280 },
  "rounded_to_nearest": 10,
  "statement": "The number of vehicles held in NURTW records under the requested criteria.",
  "limitation": "…",
  "data_as_of": "2026-09-30T22:59:59.999Z",
  "verified_at": "…"
}`;

export function ApiDocs({ signedIn }: { signedIn: boolean }) {
  const integration = useSWR<OpenApiDocument>(
    "/docs/integration.json",
    fetcher<OpenApiDocument>,
    { revalidateOnFocus: false },
  );
  // Asked only where a session cookie is present; a visitor asks nothing.
  const me = useSWR<MeResponse>(
    signedIn ? "/auth/me" : null,
    fetcher<MeResponse>,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const internalAllowed =
    me.data?.permissions.some(
      (entry) => entry.permission === READ_INTERNAL_DOCS,
    ) ?? false;
  const internal = useSWR<OpenApiDocument>(
    internalAllowed ? "/docs/openapi.json" : null,
    fetcher<OpenApiDocument>,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const operations = useMemo(
    () => (integration.data ? operationsOf(integration.data) : []),
    [integration.data],
  );
  const sections: (readonly [string, string])[] = internalAllowed
    ? [...SECTIONS, ["internal", "Internal reference"]]
    : [...SECTIONS];

  return (
    <div className="relative isolate flex min-h-dvh flex-1 flex-col lg:px-9">
      <PublicBackdrop id="docs-network" />
      <CardBands />

      <header className="sticky top-0 z-30 border-b border-line bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-paper shadow-card ring-1 ring-line">
              {/* eslint-disable-next-line @next/next/no-img-element -- a small, static public asset; next/image's build-time optimisation buys nothing here. */}
              <img src="/logo.png" alt="" className="size-6 object-contain" />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold tracking-tight">
                NURTW Verification API
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                Developer documentation
              </span>
            </span>
          </Link>
          <nav aria-label="Documentation" className="flex items-center gap-1">
            <Link
              href="/portal/login"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "hidden sm:inline-flex",
              )}
            >
              Organisation portal
            </Link>
            <Link
              href="/portal/apply"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Apply for access
            </Link>
            <ThemeButton />
          </nav>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-10 px-4 py-10 sm:px-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <nav
            aria-label="On this page"
            className="sticky top-24 grid gap-0.5 text-sm"
          >
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-faint-foreground">
              On this page
            </p>
            {sections.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
              >
                {label}
              </a>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 animate-rise-in">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1 text-xs font-medium text-brand-text shadow-card backdrop-blur">
              <SteeringWheel className="size-3.5 animate-steer-once" />
              For organisations the Union has approved
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              The NURTW Verification API
            </h1>
            <UnionRule className="mt-5" />
            <p className="mt-4 text-base text-muted-foreground sm:text-lg">
              Check a plate, a sticker, or a membership card against the records
              of the National Union of Road Transport Workers, Anambra State
              Council, and read vehicle totals. Every route is versioned under{" "}
              <InlineCode>/api/v1</InlineCode>, takes and answers JSON, and is
              reached with an API token the Union issues you.
            </p>
            <dl className="mt-6 grid gap-3 sm:grid-cols-3">
              <Fact label="Authentication" value="Bearer API token" />
              <Fact label="Format" value="JSON over HTTPS" />
              <Fact label="Version" value="v1, never broken" />
            </dl>
            {internalAllowed ? (
              <Notice
                tone="caution"
                title="The internal reference is shown at the foot of this page"
                icon={Lock}
                className="mt-6"
              >
                You hold <InlineCode>docs.read_internal</InlineCode>, so the
                whole map of routes is shown to you. Nobody else sees it.
              </Notice>
            ) : null}
          </div>

          <div className="mt-12 grid max-w-3xl gap-14">
            <DocSection id="overview" title="What a match means">
              <p>
                A match confirms <strong>only</strong> that a matching NURTW
                record exists under the criteria you asked about. It is not
                evidence of ownership, roadworthiness, licensing, or insurance,
                and nothing you build on it should present it as such.
              </p>
              <p>
                This is not a directory. No route lists members or vehicles, and
                no answer says why something did not match.
              </p>
            </DocSection>

            <DocSection id="access" title="Getting access">
              <ol className="grid gap-3">
                <Step n={1} title="Apply">
                  Use the{" "}
                  <Link href="/portal/apply" className="text-link underline">
                    application form
                  </Link>
                  , or the invitation the Union sent you.
                </Step>
                <Step n={2} title="Be approved">
                  The Union confirms your application by telephone or letter,
                  and agrees with you the checks you may make (your scopes),
                  what an answer may carry (your disclosure profile), and a
                  data-sharing agreement.
                </Step>
                <Step n={3} title="Issue your tokens">
                  Sign in to the{" "}
                  <Link href="/portal/login" className="text-link underline">
                    organisation portal
                  </Link>{" "}
                  to issue and replace tokens, and to see your usage.
                </Step>
              </ol>
            </DocSection>

            <DocSection id="authentication" title="Authentication">
              <p>
                Send your token as{" "}
                <InlineCode>Authorization: Bearer &lt;token&gt;</InlineCode>,
                and nowhere else. A token in a query string or a cookie
                authenticates nothing.
              </p>
              <ul className="grid list-disc gap-2 pl-5">
                <li>
                  A token looks like <InlineCode>nurtw_abcd2345_…</InlineCode>:
                  a fixed prefix, eight characters that identify it, and a
                  secret. It is shown once, when it is issued or replaced. Keep
                  it out of source code, URLs, and logs.
                </li>
                <li>
                  It expires after 90 days. A replaced token keeps working for
                  an overlap agreed with you, so you can switch without an
                  outage.
                </li>
                <li>
                  Every credential failure answers the same{" "}
                  <InlineCode>401</InlineCode>, whatever the reason. A valid
                  token asking for a scope it does not hold answers{" "}
                  <InlineCode>403</InlineCode>.
                </li>
              </ul>
              <CodeBlock
                label="A check"
                code={`curl -X POST "$NURTW_API/api/v1/verification/vehicle/plate" \\
  -H "Authorization: Bearer $NURTW_TOKEN" \\
  -H "X-Request-ID: your-own-id-123" \\
  -H "Content-Type: application/json" \\
  -d '{ "plate_number": "ABC 123 XY" }'`}
              />
              <p className="text-sm text-muted-foreground">
                <InlineCode>$NURTW_API</InlineCode> is the address the Union
                gives you with your token.
              </p>
            </DocSection>

            <DocSection id="request-ids" title="Request ids">
              <p>
                Send your own <InlineCode>X-Request-ID</InlineCode> on every
                request: 1 to 200 printable characters, with no spaces. A
                request without one answers <InlineCode>400</InlineCode> and
                spends none of your limits.
              </p>
              <p>
                Every answer, refusals included, carries the System&apos;s own
                id in <InlineCode>X-Server-Request-ID</InlineCode>. Quote both
                when you contact the Union.
              </p>
            </DocSection>

            <DocSection id="endpoints" title="Endpoints">
              <p>
                Read from the running API, so this list is the API as it is.
                Each route needs its own scope.
              </p>
              {integration.error ? (
                <Notice tone="caution" title="The routes could not be loaded">
                  The System may be starting up after a quiet spell. Try again
                  in a minute.
                </Notice>
              ) : !integration.data ? (
                <UnionLoader compact label="Loading the routes…" />
              ) : (
                <div className="grid gap-5">
                  {operations.map((operation) => (
                    <Endpoint key={operation.id} operation={operation} />
                  ))}
                </div>
              )}
            </DocSection>

            <DocSection id="answers" title="Answers">
              <p>
                Every check answers <InlineCode>200</InlineCode>. A match
                carries the fields your disclosure profile permits, of those the
                check may carry. A field may still be{" "}
                <InlineCode>null</InlineCode>.
              </p>
              <CodeBlock label="A match" code={MATCH_EXAMPLE} />
              <p>
                <strong>Every non-match is the same answer</strong>, whatever
                the reason. Asking again will not give a different one; quote
                the <InlineCode>request_id</InlineCode> to the Union instead.
              </p>
              <CodeBlock label="No match" code={NO_MATCH_EXAMPLE} />
              <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-line bg-surface-muted text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Check</th>
                      <th className="px-4 py-2.5 font-medium">
                        Fields a match may carry
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {[
                      [
                        "Plate",
                        "plate_number, vehicle_category, sticker_status, organizational_unit, attached_at",
                      ],
                      [
                        "Sticker",
                        "vehicle_category, sticker_status, organizational_unit, attached_at",
                      ],
                      [
                        "Combined",
                        "the plate's fields, and plate_matches_sticker",
                      ],
                      [
                        "Membership",
                        "membership_status, card_status, designation, organizational_unit",
                      ],
                    ].map(([check, fields]) => (
                      <tr key={check}>
                        <td className="px-4 py-2.5 font-medium">{check}</td>
                        <td className="px-4 py-2.5 font-mono text-xs">
                          {fields}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-muted-foreground">
                Send a sticker&apos;s code exactly as your scanner read it. Some
                codes hold a web address ending in the sticker&apos;s number;
                the System takes the number out itself.
              </p>
            </DocSection>

            <DocSection id="totals" title="Vehicle totals">
              <p>
                The exact total takes no parameter at all; any parameter is a{" "}
                <InlineCode>400</InlineCode>. A filtered total takes{" "}
                <InlineCode>zone_id</InlineCode> or{" "}
                <InlineCode>branch_id</InlineCode> (not both),{" "}
                <InlineCode>vehicle_category</InlineCode>, and{" "}
                <InlineCode>period</InlineCode>: a month (
                <InlineCode>2026-09</InlineCode>), quarter (
                <InlineCode>2026-Q3</InlineCode>), or year (
                <InlineCode>2026</InlineCode>) that has begun. Any other
                parameter is a <InlineCode>400</InlineCode>, never ignored. The
                ids and codes the filters take come from the metadata route.
              </p>
              <p>
                A small filtered total reads{" "}
                <InlineCode>&quot;SUPPRESSED&quot;</InlineCode>, with the same
                status and shape. Every other filtered total is rounded to the
                nearest <InlineCode>rounded_to_nearest</InlineCode>, so totals
                cannot be subtracted to recover a small one.
              </p>
              <CodeBlock label="A filtered total" code={TOTAL_EXAMPLE} />
            </DocSection>

            <DocSection id="errors" title="Errors">
              <p>
                Every failure answers in one shape. The message is deliberately
                plain; the detail is kept against the{" "}
                <InlineCode>requestId</InlineCode>. Only a{" "}
                <InlineCode>400</InlineCode> carries{" "}
                <InlineCode>details</InlineCode>, and those describe only the
                request you sent.
              </p>
              <CodeBlock label="A rejected request" code={ERROR_EXAMPLE} />
              <dl className="grid gap-2 sm:grid-cols-2">
                {[
                  [
                    "400",
                    "The body, a parameter, or the request id failed validation.",
                  ],
                  ["401", "No valid API token, whatever the reason."],
                  ["403", "The token does not hold the scope the route needs."],
                  [
                    "429",
                    "A limit was reached, or your organisation is paused.",
                  ],
                  ["503", "The service is degraded. Try again later."],
                ].map(([code, meaning]) => (
                  <div
                    key={code}
                    className="flex gap-3 rounded-lg border border-line bg-surface p-3 shadow-card"
                  >
                    <dt className="font-mono text-sm font-semibold">{code}</dt>
                    <dd className="text-sm text-muted-foreground">{meaning}</dd>
                  </div>
                ))}
              </dl>
            </DocSection>

            <DocSection id="limits" title="Limits and pauses">
              <p>
                Limits apply to your organisation, across all its tokens. The
                Union sets them on your limit profile and may change them. Over
                a limit, the answer is <InlineCode>429</InlineCode> with{" "}
                <InlineCode>Retry-After</InlineCode> in seconds: wait that long.
                A refused request is not counted against a quota.
              </p>
              <p>
                Checks that follow a pattern pause your organisation, and every
                request then answers <InlineCode>429</InlineCode> until the
                pause ends or the Union lifts it. Check what you have been asked
                to check, as it is presented to you, and nothing else.
              </p>
            </DocSection>

            <DocSection id="obligations" title="Your obligations">
              <ul className="grid list-disc gap-2 pl-5">
                <li>
                  Use an answer only for the purpose your access was granted
                  for. Do not log, cache, or forward personal data beyond it.
                </li>
                <li>
                  Never present a match as proof of ownership, roadworthiness,
                  licensing, or insurance.
                </li>
                <li>
                  Chassis and VIN numbers, guarantors, next of kin, signatures,
                  and internal notes are never reachable here. Do not ask for
                  them.
                </li>
              </ul>
            </DocSection>

            <DocSection id="versioning" title="Versioning">
              <p>
                Version 1 will not be broken while organisations hold tokens for
                it. A breaking change arrives as{" "}
                <InlineCode>/api/v2</InlineCode>, served alongside it. A new
                optional field or a new route may arrive within v1, so ignore
                fields you do not recognise rather than failing on them.
              </p>
            </DocSection>

            {internalAllowed ? (
              <DocSection id="internal" title="Internal reference">
                <InternalReference
                  document={internal.data}
                  failed={Boolean(internal.error)}
                />
              </DocSection>
            ) : null}
          </div>
        </main>
      </div>

      <footer className="shrink-0">
        <p className="mx-auto max-w-7xl px-4 pb-4 text-xs text-faint-foreground sm:px-8">
          National Union of Road Transport Workers, Anambra State Council. A
          verification confirms only that a matching NURTW record exists; it is
          not evidence of ownership, roadworthiness, licensing, or insurance.
        </p>
        <RoadStrip />
      </footer>
    </div>
  );
}

function DocSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <UnionRule className="mt-2.5" />
      <div className="mt-5 grid gap-4 leading-relaxed text-foreground">
        {children}
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface/85 p-3 shadow-card backdrop-blur">
      <dt className="text-xs font-medium uppercase tracking-wide text-faint-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-4 rounded-xl border border-line bg-surface p-4 shadow-card">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-nurtw-green-deep text-sm font-semibold text-on-solid">
        {n}
      </span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">
          {children}
        </span>
      </span>
    </li>
  );
}

function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code className="rounded border border-line bg-surface-muted px-1 py-px font-mono text-[0.85em]">
      {children}
    </code>
  );
}

/** A route's own words, in paragraphs. */
function Prose({ text }: { text: string }) {
  if (!text) {
    return null;
  }
  return (
    <>
      {text.split(/\n{2,}/).map((paragraph, index) => (
        <p key={index} className="text-sm text-muted-foreground">
          <Inline text={paragraph} />
        </p>
      ))}
    </>
  );
}

/** One run of a route's words, with `code` and **bold** as the API writes them. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`|\*\*[^*]+\*\*)/).map((part, at) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 1 ? (
          <InlineCode key={at}>{part.slice(1, -1)}</InlineCode>
        ) : part.startsWith("**") && part.endsWith("**") ? (
          <strong key={at} className="text-foreground">
            {part.slice(2, -2)}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <figure className="overflow-hidden rounded-xl border border-line shadow-card">
      <figcaption className="flex items-center justify-between gap-3 bg-road px-4 py-2 text-xs text-road-marking">
        <span className="font-medium">{label}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            });
          }}
          className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-road-marking/15"
        >
          {copied ? (
            <Check className="size-3.5" aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </figcaption>
      <pre className="overflow-x-auto border-t border-road-marking/10 bg-road px-4 py-3 font-mono text-[13px] leading-relaxed text-road-marking">
        <code>{code}</code>
      </pre>
    </figure>
  );
}

function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-14 items-center justify-center rounded-md border px-2 font-mono text-xs font-semibold",
        method === "GET"
          ? "border-line bg-surface-muted text-link"
          : "border-nurtw-green-deep bg-nurtw-green-deep text-on-solid",
      )}
    >
      {method}
    </span>
  );
}

function AccessChip({ access }: { access: Access }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface-muted px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground">
      {access.kind === "public" ? null : (
        <Lock className="size-3 shrink-0" aria-hidden />
      )}
      <span className="truncate">{accessLabel(access)}</span>
    </span>
  );
}

function Fields({ title, fields }: { title: string; fields: DocField[] }) {
  if (fields.length === 0) {
    return null;
  }
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-faint-foreground">
        {title}
      </p>
      <dl className="mt-2 divide-y divide-line rounded-lg border border-line">
        {fields.map((field) => (
          <div
            key={field.name}
            className="grid gap-1 px-3 py-2 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4"
          >
            <dt className="font-mono text-xs">
              {field.name}
              {field.required ? (
                <span className="ml-1.5 font-sans text-[11px] text-verdict-deny">
                  required
                </span>
              ) : null}
            </dt>
            <dd className="text-xs text-muted-foreground">
              <span className="font-mono">{field.type}</span>
              {field.description ? (
                <>
                  {" — "}
                  <Inline text={field.description} />
                </>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Endpoint({ operation }: { operation: DocOperation }) {
  const body = exampleBody(operation.body);
  const example =
    operation.method === "GET"
      ? `curl "$NURTW_API${operation.path}" \\
  -H "Authorization: Bearer $NURTW_TOKEN" \\
  -H "X-Request-ID: your-own-id-123"`
      : `curl -X ${operation.method} "$NURTW_API${operation.path}" \\
  -H "Authorization: Bearer $NURTW_TOKEN" \\
  -H "X-Request-ID: your-own-id-123" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(body)}'`;
  return (
    <article
      id={operation.id}
      className="group scroll-mt-24 overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition-shadow hover:shadow-lift"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface-muted/60 px-5 py-3">
        <MethodBadge method={operation.method} />
        <code className="min-w-0 break-all font-mono text-sm font-medium">
          {operation.path}
        </code>
        <span className="sm:ml-auto">
          <AccessChip access={operation.access} />
        </span>
      </div>
      <div className="grid gap-4 p-5">
        <h3 className="text-base font-semibold">{operation.summary}</h3>
        <Prose text={operation.description} />
        <Fields title="Body" fields={operation.body} />
        <Fields title="Parameters" fields={operation.parameters} />
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-faint-foreground">
            Answers
          </p>
          <ul className="mt-2 grid gap-1.5">
            {operation.responses.map((response) => (
              <li key={response.status} className="flex gap-3 text-xs">
                <span className="w-9 shrink-0 font-mono font-semibold">
                  {response.status}
                </span>
                <span className="text-muted-foreground">
                  {response.description}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <CodeBlock label="Example" code={example} />
      </div>
    </article>
  );
}

const ACCESS_FILTERS = [
  ["all", "Every route"],
  ["permission", "A permission"],
  ["signed-in", "Any signed-in officer"],
  ["scope", "An organisation's scope"],
  ["portal", "The organisation portal"],
  ["public", "Public"],
] as const;

/**
 * The whole map, for a holder of `docs.read_internal`. Searched and filtered in
 * the browser; the document came from the API, which checked the permission.
 */
function InternalReference({
  document,
  failed,
}: {
  document: OpenApiDocument | undefined;
  failed: boolean;
}) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<(typeof ACCESS_FILTERS)[number][0]>("all");
  const operations = useMemo(
    () => (document ? operationsOf(document) : []),
    [document],
  );

  if (failed) {
    return (
      <Notice tone="caution" title="The internal reference could not be loaded">
        Your session may have ended. Sign in again, then reopen this page.
      </Notice>
    );
  }
  if (!document) {
    return <UnionLoader compact label="Loading the internal reference…" />;
  }

  const shown = operations.filter(
    (operation) =>
      (kind === "all" || operation.access.kind === kind) &&
      matchesSearch(operation, search),
  );

  return (
    <div className="grid gap-4">
      <Notice tone="caution" title="Shown to you alone" icon={Lock}>
        Every route, and what it requires. It is what someone probing the API
        would want to know: do not share it with anyone outside the Union.
      </Notice>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid min-w-0 flex-1 gap-1 text-sm font-medium">
          Search
          <span className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint-foreground"
              aria-hidden
            />
            <TextInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="A path, a permission, a word"
              className="pl-9"
            />
          </span>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Who may call it
          <Select
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as (typeof ACCESS_FILTERS)[number][0])
            }
          >
            {ACCESS_FILTERS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </label>
        <button
          type="button"
          onClick={() => {
            const blob = new Blob([JSON.stringify(document, null, 2)], {
              type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const link = window.document.createElement("a");
            link.href = url;
            link.download = "nurtw-openapi.json";
            link.click();
            URL.revokeObjectURL(url);
          }}
          className={buttonVariants({ variant: "secondary" })}
        >
          <Download aria-hidden />
          Download openapi.json
        </button>
      </div>
      <p className="text-sm text-muted-foreground" role="status">
        {shown.length === operations.length
          ? `${operations.length} routes`
          : `${shown.length} of ${operations.length} routes`}
      </p>
      {byArea(shown).map((group) => (
        <div key={group.area} className="grid gap-2">
          <h3 className="font-mono text-sm font-semibold text-brand-text">
            /{group.area}
          </h3>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            {group.operations.map((operation) => (
              <li key={operation.id}>
                <details className="group/route">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 transition-colors hover:bg-surface-muted">
                    <MethodBadge method={operation.method} />
                    <code className="min-w-0 break-all font-mono text-xs">
                      {operation.path}
                    </code>
                    <span className="text-xs text-muted-foreground">
                      {operation.summary}
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                      <AccessChip access={operation.access} />
                      <ArrowRight
                        className="size-3.5 text-faint-foreground transition-transform group-open/route:rotate-90"
                        aria-hidden
                      />
                    </span>
                  </summary>
                  <div className="grid gap-3 border-t border-line bg-surface-muted/40 px-4 py-3">
                    <Prose text={operation.description} />
                    <Fields title="Body" fields={operation.body} />
                    <Fields title="Parameters" fields={operation.parameters} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
