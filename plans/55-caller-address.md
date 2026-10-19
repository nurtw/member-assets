## Item
55 — caller-address

## Source
The owner's direction of 19 October 2026 ("let's also do a proper fix"). GOV-02 (the move
to DigitalOcean). Requirement 14 (limits per address), Requirement 12.8 and item 11 (an
organisation's address ranges), and every audit event that records an address.

## Goal
The API records each caller's real address on DigitalOcean: an organisation calling it
directly, and a visitor whose browser reaches it through the website. Nobody can choose
the address the API records by sending a header of their own.

## Approach
1. **Direct callers.** Express trusts the platform's router (as now) and, only when
   `EDGE_PROXY=cloudflare`, exactly one hop more, and only if that hop is a Cloudflare
   address (`trustedHop`, `apps/api/src/common/client-address.ts`). Unset, the API
   behaves as it does today.
2. **Visitors through the website.** `apps/web/src/proxy.ts` (Next.js 16 Proxy, before the
   rewrite) removes the two forwarding headers from every `/api/v1` request, and, when
   `WEB_FORWARDING_SECRET` is set, adds the secret and the address Vercel gives
   (`x-vercel-forwarded-for`, then `x-real-ip`). The API takes that address only when the
   secret matches, compared in constant time, and only if it is one valid address.
3. **One place.** `applyClientAddress` sets both, from `main.ts`; the end-to-end suite
   calls it too. Every reader keeps using `request.ip`.
4. The header names live in `@nurtw/contracts`, so both sides agree.

## Files likely touched
`apps/api/src/common/client-address.ts` (+ spec), `apps/api/src/main.ts`,
`apps/api/src/config/environment.ts`, a new e2e, `packages/contracts`,
`apps/web/src/proxy.ts`, `apps/web/src/lib/visitor-address.ts` (+ test), `.env.example`,
`OPERATIONS.md`, `CLAUDE.md`.

## Out of scope
Changing any limit's value, or how an address is stored or shown.

## Definition of done
- [x] Direct: the address before one Cloudflare hop is recorded; a forged
      `X-Forwarded-For` entry never is.
- [x] Through the website: the visitor's address is recorded only with the right secret.
- [x] A browser cannot supply either forwarding header.
- [x] Unit, e2e, and web tests pass (api 208, web 106, e2e 559 of 559); clicked through on
      the local stack, through a website with the secret, one without, and directly.
- [ ] After the deploy, the live log shows this machine's address, directly and through
      the website.
