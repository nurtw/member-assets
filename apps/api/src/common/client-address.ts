import { createHash, timingSafeEqual } from 'node:crypto';
import { BlockList, isIP } from 'node:net';

import {
  FORWARDING_KEY_HEADER,
  VISITOR_ADDRESS_HEADER,
} from '@nurtw/contracts';
import type { Express, NextFunction, Request, Response } from 'express';

import type { EdgeProxy } from '../config/environment.js';

/**
 * Who is calling (item 55): the address every per-address limit, the access
 * log, the sign-in log, sessions, audit events, and an organisation's
 * address ranges all read, as `request.ip`.
 *
 * A request reaches this container through the host's router, which names
 * the address it was connected from in `X-Forwarded-For`. Without trusting
 * that hop, `request.ip` is the router's own address for every request.
 * Anything earlier in the header was written by whoever sent the request, so
 * it is never believed.
 *
 * On DigitalOcean App Platform, Cloudflare stands in front of the router, so
 * the router names a Cloudflare address. With `EDGE_PROXY=cloudflare` one hop
 * more is trusted, and only when it is a Cloudflare address: the caller is
 * then the address Cloudflare was connected from. If the hop is anything
 * else, it is taken as the caller, so a change at the host can make limits
 * coarser but can never let a caller choose their own address.
 *
 * A browser reaches the API through the website, so the address Cloudflare
 * sees is the website host's. The website names the visitor in
 * `VISITOR_ADDRESS_HEADER`, with the shared secret in
 * `FORWARDING_KEY_HEADER`, and the visitor is believed only when the secret
 * matches.
 */

/**
 * Cloudflare's published ranges (https://www.cloudflare.com/ips/), read on
 * 19 October 2026. A caller who reaches the API through a range added since
 * is recorded as that Cloudflare address: their limits are shared, and their
 * address still cannot be forged.
 */
const CLOUDFLARE_RANGES: readonly string[] = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];

const EDGE_RANGES: Record<Exclude<EdgeProxy, 'none'>, BlockList> = {
  cloudflare: blockListOf(CLOUDFLARE_RANGES),
};

function blockListOf(ranges: readonly string[]): BlockList {
  const list = new BlockList();
  for (const range of ranges) {
    const [network, prefix] = range.split('/') as [string, string];
    list.addSubnet(
      network,
      Number(prefix),
      isIP(network) === 6 ? 'ipv6' : 'ipv4',
    );
  }
  return list;
}

/** `::ffff:203.0.113.7` is an IPv4 address, written as IPv6. */
function unmapped(address: string): string {
  const v4 = address.toLowerCase().startsWith('::ffff:')
    ? address.slice(7)
    : '';
  return isIP(v4) === 4 ? v4 : address;
}

function isWithin(list: BlockList, address: string): boolean {
  const plain = unmapped(address);
  const family = isIP(plain);
  if (family === 0) return false;
  return list.check(plain, family === 6 ? 'ipv6' : 'ipv4');
}

/**
 * Express's `trust proxy`. Hop 0 is the host's router, which connected to
 * this container; hop 1 is the last address in `X-Forwarded-For`, and so on
 * towards the caller. The first hop not trusted is the caller.
 */
export function trustedHop(
  edge: EdgeProxy,
): (address: string, hop: number) => boolean {
  const ranges = edge === 'none' ? undefined : EDGE_RANGES[edge];
  return (address, hop) => {
    if (hop === 0) return true;
    return hop === 1 && ranges !== undefined && isWithin(ranges, address);
  };
}

/**
 * The visitor the website names, when its key is the shared secret and its
 * address is one valid address. Otherwise `undefined`, and the request is
 * taken as coming from whoever connected.
 */
export function forwardedVisitor(
  key: string | undefined,
  visitor: string | undefined,
  secret: string | undefined,
): string | undefined {
  if (!secret || !key || !visitor) return undefined;
  if (!sameSecret(key, secret)) return undefined;
  const address = visitor.trim();
  return isIP(address) === 0 ? undefined : unmapped(address);
}

/** Compared as digests, so neither the time taken nor a length differs. */
function sameSecret(given: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

/**
 * Sets the trusted hops, and believes a visitor the website names. Called by
 * `main.ts` before the access log, so the log records the same address, and
 * by the end-to-end suite. Both headers are removed from every request, so
 * nothing after this point can read the secret.
 */
export function applyClientAddress(
  app: Express,
  options: { edgeProxy: EdgeProxy; webForwardingSecret: string | undefined },
): void {
  app.set('trust proxy', trustedHop(options.edgeProxy));
  app.use((request: Request, _response: Response, next: NextFunction) => {
    const visitor = forwardedVisitor(
      request.header(FORWARDING_KEY_HEADER),
      request.header(VISITOR_ADDRESS_HEADER),
      options.webForwardingSecret,
    );
    delete request.headers[FORWARDING_KEY_HEADER];
    delete request.headers[VISITOR_ADDRESS_HEADER];
    if (visitor) {
      Object.defineProperty(request, 'ip', {
        value: visitor,
        configurable: true,
        enumerable: true,
      });
    }
    next();
  });
}
