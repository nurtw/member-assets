import type { NextConfig } from "next";

/**
 * Where the API actually lives — read once, here, at build/start time.
 *
 * Not exposed to the browser bundle despite the `NEXT_PUBLIC_` name (kept
 * for continuity with existing deployment configuration): the browser now
 * only ever talks to this application's own origin. `rewrites()` below
 * forwards `/api/v1/*` to this address server-side, invisibly to the client.
 *
 * `||`, not `??`, for the same reason `src/lib/api.ts` used to need it:
 * Next inlines an unset `NEXT_PUBLIC_` variable as an empty string in some
 * environments, and `"" ?? fallback` is `""`.
 */
const CONFIGURED_API_ORIGIN = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
const API_ORIGIN = CONFIGURED_API_ORIGIN || "http://localhost:3001/api/v1";

if (!CONFIGURED_API_ORIGIN && process.env.NODE_ENV === "production") {
  throw new Error(
    "NEXT_PUBLIC_API_BASE_URL is required in production. Set it to the API's " +
      "public origin, including the /api/v1 prefix — it is now the rewrite " +
      "destination, not a value read by the browser.",
  );
}

const nextConfig: NextConfig = {
  /**
   * Workspace packages are compiled by Next rather than consumed as prebuilt
   * output. This keeps `pnpm dev` working without a separate watch build of the
   * packages, and means a change to a domain rule is picked up immediately.
   *
   * ARCHITECTURE.md Decision 3.1 — response types are declared once in
   * @nurtw/contracts and imported here, so a change to a response shape produces
   * a compile error in the web application rather than a runtime defect.
   */
  transpilePackages: ["@nurtw/contracts", "@nurtw/domain"],

  /**
   * Proxies every API call through this application's own origin.
   *
   * The API is a separate deployment (Render) from the web application
   * (Vercel) — genuinely different domains. The session cookie used to be
   * set `SameSite=None` to survive that, which worked until a browser
   * blocking third-party cookies by default (Chrome's ongoing rollout,
   * Firefox/Safari tracking protection) silently dropped it: login would
   * succeed, the very next request would look unauthenticated, and the
   * officer was bounced back to `/login` with no error at all — a
   * session-check failure, not a login failure, so the login screen's own
   * error state never fired.
   *
   * With every browser request routed through here instead, the cookie is
   * set — and read back — as first-party, immune to third-party-cookie
   * blocking regardless of what any browser decides to restrict next.
   * `src/lib/api.ts` calls only relative paths now; see its comment.
   */
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${API_ORIGIN}/:path*`,
      },
    ];
  },
};

export default nextConfig;
