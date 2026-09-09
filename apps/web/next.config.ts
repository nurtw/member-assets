import type { NextConfig } from "next";

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
   * The API is a separate deployment (DigitalOcean) from the web application
   * (Vercel), so its base URL is environment configuration.
   * ARCHITECTURE.md Decision 12.1 — no platform-specific API is called from
   * application code; only configuration differs between environments.
   */
  /**
   * NEXT_PUBLIC_ variables are inlined by Next from the environment and from
   * .env files without being listed here.
   *
   * The previous explicit mapping defaulted to an empty string, which is worse
   * than leaving it undefined: `undefined` falls through a `??` fallback, an
   * empty string does not, and every API call became a relative request against
   * the web origin. Configuration is read in one place — src/lib/api.ts — which
   * both supplies the development default and refuses to start production
   * without a real value.
   */
};

export default nextConfig;
