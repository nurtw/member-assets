import type { MetadataRoute } from "next";

/**
 * PRD §2.2 — the System is not a public directory. Verification is permitted;
 * browsing is not.
 *
 * The public verification page is reachable only by scanning a physical sticker
 * (PRD §23.13), so possession of the article is a precondition of any result.
 * Refusing indexing keeps those result pages from accumulating in a search index
 * and becoming, collectively, the browsable listing the PRD forbids.
 *
 * This is defence in depth rather than a control in itself — robots.txt is
 * advisory and a hostile crawler will ignore it. The actual protections are
 * authentication, scope enforcement, and rate limiting.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
