import { isIP } from "node:net";

import {
  FORWARDING_KEY_HEADER,
  VISITOR_ADDRESS_HEADER,
} from "@nurtw/contracts";

/**
 * Naming the visitor to the API (item 55).
 *
 * Every browser request reaches the API through this application's rewrite,
 * so the API sees this host's address, not the visitor's. Per-address limits
 * would then be shared by everyone, and every audit event would record the
 * same address. `proxy.ts` adds the visitor's address, and the shared secret
 * that makes the API believe it.
 *
 * **The address is the one the host sets.** Vercel writes
 * `x-vercel-forwarded-for` and `x-real-ip` itself and overwrites what a
 * browser sends, so neither can be forged there. Set `WEB_FORWARDING_SECRET`
 * only on a host that does the same: elsewhere a browser could name any
 * address it liked.
 */

/** The address the host says the visitor connected from, if one is valid. */
export function visitorAddress(headers: Headers): string | undefined {
  for (const name of ["x-vercel-forwarded-for", "x-real-ip"]) {
    const value = headers.get(name)?.split(",")[0]?.trim();
    if (value && isIP(value) !== 0) return value;
  }
  return undefined;
}

/**
 * The headers to send the API. Both forwarding headers are always removed,
 * so a browser can supply neither; with a secret and a valid address, they
 * are added back with this application's own values.
 */
export function forwardingHeaders(
  incoming: Headers,
  secret: string | undefined,
): Headers {
  const headers = new Headers(incoming);
  headers.delete(FORWARDING_KEY_HEADER);
  headers.delete(VISITOR_ADDRESS_HEADER);
  const visitor = visitorAddress(incoming);
  if (secret && visitor) {
    headers.set(FORWARDING_KEY_HEADER, secret);
    headers.set(VISITOR_ADDRESS_HEADER, visitor);
  }
  return headers;
}
