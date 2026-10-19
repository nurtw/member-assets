import { NextResponse, type NextRequest } from "next/server";

import { forwardingHeaders } from "@/lib/visitor-address";

/**
 * Names the visitor to the API (item 55; `lib/visitor-address.ts`).
 *
 * Proxy runs before the rewrite in `next.config.ts`, so the headers set here
 * travel with the request to the API. They are request headers only: the
 * browser never sees the secret. `WEB_FORWARDING_SECRET` is read at run time
 * and is not a `NEXT_PUBLIC_` variable, so it is in no bundle.
 */
export function proxy(request: NextRequest) {
  return NextResponse.next({
    request: {
      headers: forwardingHeaders(
        request.headers,
        process.env.WEB_FORWARDING_SECRET?.trim() || undefined,
      ),
    },
  });
}

export const config = {
  matcher: "/api/v1/:path*",
};
