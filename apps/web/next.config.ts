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
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? "",
  },
};

export default nextConfig;
