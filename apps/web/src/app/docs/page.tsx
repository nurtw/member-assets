import type { Metadata } from "next";
import { cookies } from "next/headers";

import { ApiDocs } from "@/components/api-docs";

/**
 * The public docs page (item 54): how an approved organisation uses the
 * verification API, for anyone. The whole map of routes is added for a holder
 * of `docs.read_internal`, fetched from the API, which checks it.
 *
 * Whether a session cookie is present is only a hint, as on the front page:
 * it decides whether the page asks the API who is signed in at all, so a
 * visitor's browser asks nothing it would be refused.
 */

export const metadata: Metadata = {
  title: "API documentation",
  description:
    "How an organisation approved by NURTW Anambra State Council uses the verification API.",
};

/** The API's `SESSION_COOKIE_NAME`. */
const SESSION_COOKIE = "nurtw_session";

export default async function DocsPage() {
  const signedIn = (await cookies()).has(SESSION_COOKIE);
  return <ApiDocs signedIn={signedIn} />;
}
