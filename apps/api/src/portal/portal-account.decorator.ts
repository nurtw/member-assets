import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

export const PORTAL_METADATA_KEY = 'nurtw:portal';

/** The portal's own cookie. Never the officers' `nurtw_session`. */
export const PORTAL_COOKIE_NAME = 'nurtw_portal_session';

/**
 * `OWN` routes are the account itself: who am I, sign out, my password. They
 * stay open on a temporary password. `READY` routes are everything else, and
 * open only once the organisation has chosen its own password.
 */
export type PortalAccess = 'OWN' | 'READY';

/**
 * Marks a route as belonging to the organisation portal (item 29, EXT-20): a
 * fifth kind of route, beside a permission, any signed-in officer, a scope,
 * and public.
 *
 * It is authenticated by the portal's own session cookie and nothing else. An
 * officer's session does not reach it, an API token does not reach it, and a
 * portal session satisfies no permission. The guard refuses a route that
 * declares this together with any other kind.
 */
export const PortalAccount = (access: PortalAccess = 'READY') =>
  SetMetadata(PORTAL_METADATA_KEY, access);

/** Who a portal session belongs to. It is always exactly one organisation. */
export interface PortalPrincipal {
  readonly accountId: string;
  readonly apiClientId: string;
  readonly email: string;
  readonly fullName: string;
  readonly sessionId: string;
  readonly mustChangePassword: boolean;
}

/** Set on the request once a portal session resolves. */
export interface PortalRequest extends Request {
  portalAccount?: PortalPrincipal;
}
