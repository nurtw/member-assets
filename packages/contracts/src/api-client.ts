/**
 * External API clients and their tokens (PRD §12.1, item 11).
 *
 * An outside organisation is registered pending, approved with a disclosure
 * profile and scopes, and issued a token. These are the bodies the officer
 * routes accept and the shapes they return. Nothing here is ever sent to the
 * organisation itself except the token, once.
 */

import {
  TOKEN_ROTATION_OVERLAP_CODES,
  isValidIpRange,
  type ApiClientStatus,
  type ApiTokenState,
} from '@nurtw/domain';
import { z } from 'zod';

import type { ApiClientLimits, ApiClientPause } from './rate-limit.js';
import { API_SCOPES } from './scopes.js';

const uuid = z.uuid('A valid identifier is required.');

/** Every change to an organisation's access is audited with a reason. */
const reason = z
  .string()
  .trim()
  .min(4, 'A reason is required for this change.')
  .max(1000);

/**
 * A scope from the catalogue, and nothing else (Requirement 12.4). A broad
 * scope cannot be granted because it cannot be named: `database:read` fails
 * here before any row is written.
 */
export const apiScopeSchema = z.enum(API_SCOPES);

const scopes = z
  .array(apiScopeSchema)
  .min(1, 'Grant at least one scope.')
  .transform((granted) => [...new Set(granted)]);

const ipRange = z
  .string()
  .trim()
  .refine(
    isValidIpRange,
    'Enter one address, or a range such as 203.0.113.0/24.',
  );

/** Empty means any address. */
const allowedIpRanges = z
  .array(ipRange)
  .max(50, 'No more than 50 ranges.')
  .transform((ranges) => [...new Set(ranges)]);

const technicalContact = z.object({
  name: z.string().trim().min(2, 'A name is required.').max(120),
  /** Where a rotation reminder is addressed (Requirement 12.6). */
  email: z.email('A valid email is required.'),
  phone: z.string().trim().max(40).optional(),
});

const organisationName = z
  .string()
  .trim()
  .min(2, 'The organisation’s name is required.')
  .max(200);

const businessPurpose = z
  .string()
  .trim()
  .min(10, 'State what the organisation will use the access for.')
  .max(2000);

const agreementReference = z
  .string()
  .trim()
  .min(2, 'The agreement’s reference is required.')
  .max(200);

/** `YYYY-MM-DD`: the day the agreement was signed. */
const agreementDate = z.iso.date('Enter the date the agreement was signed.');

/** `POST /api-clients` — registers an organisation, pending approval. */
export const registerApiClientSchema = z.object({
  organisationName,
  businessPurpose,
  technicalContact,
  allowedIpRanges: allowedIpRanges.default([]),
});
export type RegisterApiClientInput = z.infer<typeof registerApiClientSchema>;

/**
 * `POST /api-clients/:id/approve`.
 *
 * A data-sharing agreement is required (the owner's direction of 3 October
 * 2026, `QUESTIONS.md` EXT-07): every credential discloses members' data to a
 * third party, so none is issued for an organisation without one on record.
 */
export const approveApiClientSchema = z.object({
  disclosureProfileId: uuid,
  scopes,
  agreementReference,
  agreementDate,
});
export type ApproveApiClientInput = z.infer<typeof approveApiClientSchema>;

/** `PATCH /api-clients/:id` — amends the record, not the access it grants. */
export const updateApiClientSchema = z
  .object({
    organisationName: organisationName.optional(),
    businessPurpose: businessPurpose.optional(),
    technicalContact: technicalContact.optional(),
    allowedIpRanges: allowedIpRanges.optional(),
    agreementReference: agreementReference.optional(),
    agreementDate: agreementDate.optional(),
    reason,
  })
  .refine(
    (value) =>
      value.organisationName !== undefined ||
      value.businessPurpose !== undefined ||
      value.technicalContact !== undefined ||
      value.allowedIpRanges !== undefined ||
      value.agreementReference !== undefined ||
      value.agreementDate !== undefined,
    { message: 'Change at least one detail.' },
  );
export type UpdateApiClientInput = z.infer<typeof updateApiClientSchema>;

/**
 * `PUT /api-clients/:id/access` — replaces the profile and the scopes of an
 * approved organisation (PRD §23.11: amendable without a deployment).
 */
export const setApiClientAccessSchema = z.object({
  disclosureProfileId: uuid,
  scopes,
  reason,
});
export type SetApiClientAccessInput = z.infer<typeof setApiClientAccessSchema>;

/**
 * The statuses an officer sets. `PENDING` is where a registration starts, and
 * `EXPIRED` is worked out from the token's dates; neither is set.
 */
export const SETTABLE_API_CLIENT_STATUSES = [
  'ACTIVE',
  'SUSPENDED',
  'REVOKED',
] as const;

/** `POST /api-clients/:id/status` — suspend, reinstate, refuse, or revoke. */
export const setApiClientStatusSchema = z.object({
  status: z.enum(SETTABLE_API_CLIENT_STATUSES),
  reason,
});
export type SetApiClientStatusInput = z.infer<typeof setApiClientStatusSchema>;

/**
 * `POST /api-clients/:id/tokens/:tokenId/rotate`. The overlap is how long the
 * token being replaced keeps working (EXT-11).
 */
export const rotateApiTokenSchema = z.object({
  overlap: z.enum(TOKEN_ROTATION_OVERLAP_CODES),
});
export type RotateApiTokenInput = z.infer<typeof rotateApiTokenSchema>;

/** `POST /api-clients/:id/tokens/:tokenId/revoke`. */
export const revokeApiTokenSchema = z.object({ reason });
export type RevokeApiTokenInput = z.infer<typeof revokeApiTokenSchema>;

/**
 * A token as an officer sees it. It holds nothing that authenticates: the
 * prefix identifies the token in a list and in the audit trail, and the secret
 * exists only in the response to the request that created it.
 */
export interface ApiTokenSummary {
  id: string;
  /** `nurtw_` and eight characters. Not secret. */
  prefix: string;
  state: ApiTokenState;
  createdAt: string;
  expiresAt: string;
  /** When a replaced token stops working; `null` unless it was replaced. */
  retiresAt: string | null;
  revokedAt: string | null;
  /** To the minute. `null` if it has never authenticated a request. */
  lastUsedAt: string | null;
  /** In use, and inside the reminder window (Requirement 12.6). */
  expiringSoon: boolean;
}

export interface ApiClientSummary {
  id: string;
  organisationName: string;
  /** As shown: an active client whose token has run out reads `EXPIRED`. */
  status: ApiClientStatus;
  disclosureProfile: { id: string; code: string; label: string } | null;
  scopes: string[];
  /** The token in use, if there is one. */
  currentToken: ApiTokenSummary | null;
  /**
   * Set only while the System is holding the organisation paused (item 13).
   * Its requests are refused until then.
   */
  pausedUntil: string | null;
  createdAt: string;
}

export interface ApiClientDetail extends ApiClientSummary {
  businessPurpose: string;
  technicalContact: { name: string; email: string; phone: string | null };
  /** Empty means any address. */
  allowedIpRanges: string[];
  agreementReference: string | null;
  agreementDate: string | null;
  registeredBy: { id: string; fullName: string } | null;
  approvedBy: { id: string; fullName: string } | null;
  approvedAt: string | null;
  /** The last status change and the reason given for it. */
  statusChangedAt: string | null;
  statusReason: string | null;
  /** The limits it is held to, and its use of them today (item 13). */
  limits: ApiClientLimits;
  /** The last time the System paused it, or `null` if it never has. */
  pause: ApiClientPause | null;
  /** Newest first. */
  tokens: ApiTokenSummary[];
}

/** `GET /api-clients`. */
export interface ApiClientList {
  clients: ApiClientSummary[];
  /** The window `expiringSoon` was worked out with. */
  reminderDays: number;
}

/**
 * The response to issuing or rotating a token. `token` is the only time the
 * secret is ever returned (Requirement 12.1).
 */
export interface IssuedApiToken {
  token: string;
  summary: ApiTokenSummary;
}
