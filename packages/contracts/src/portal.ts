/**
 * The organisation portal (PRD §23.23, revision 1.9; `QUESTIONS.md` EXT-20 —
 * item 29).
 *
 * Two audiences use these shapes: an outside organisation, signed in to its
 * own portal account, and the API administrator, who still decides everything
 * about its access. Nothing here lets an organisation choose its own scopes,
 * disclosure profile, or limits.
 */

import {
  APPLICANT_CONFIRMATIONS,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  type ApiClientStatus,
  type InvitationStanding,
  type PortalUsageClass,
} from '@nurtw/domain';
import { z } from 'zod';

import type { ApiTokenSummary } from './api-client.js';

/** Lower-cased, as officers' addresses are, so a sign-in finds the account. */
const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'An email address is required.')
  .max(320)
  .pipe(z.email('A valid email address is required.'));

const newPassword = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(MAX_PASSWORD_LENGTH);

const personName = z.string().trim().min(2, 'A name is required.').max(120);

/**
 * `POST /portal/applications`, from the public form.
 *
 * The telephone number is required: the administrator confirms the applicant
 * by telephone or letter before approving, since the System sends no mail
 * (EXT-20). The applicant chooses the portal password here, and it is asked
 * of nobody else.
 */
export const portalApplicationSchema = z.object({
  organisationName: z
    .string()
    .trim()
    .min(2, 'The organisation’s name is required.')
    .max(200),
  businessPurpose: z
    .string()
    .trim()
    .min(10, 'State what the organisation will use the access for.')
    .max(2000),
  contactName: personName,
  email,
  phone: z
    .string()
    .trim()
    .min(7, 'A telephone number is required, to confirm the application.')
    .max(40),
  password: newPassword,
  /**
   * The code from an invitation's link (item 33, EXT-21). An open invitation
   * is used by this application; any other code is ignored, and the
   * application goes in uninvited. Either way the answer is the same.
   */
  invitationCode: z.string().trim().max(64).optional(),
});
export type PortalApplicationInput = z.infer<typeof portalApplicationSchema>;

/** The same answer for every application, whatever became of it. */
export interface PortalApplicationReceived {
  received: true;
}

/** `POST /portal/login`. Shape only, like the officers' sign-in. */
export const portalLoginSchema = z.object({
  email,
  password: z.string().min(1, 'A password is required.').max(1024),
});
export type PortalLoginInput = z.infer<typeof portalLoginSchema>;

/** `POST /portal/password` — the organisation's own. */
export const portalChangePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, 'Your current password is required.')
    .max(1024),
  newPassword,
});
export type PortalChangePasswordInput = z.infer<
  typeof portalChangePasswordSchema
>;

/** `POST /api-clients/:id/portal-account/reset-password`, by the administrator. */
export const resetPortalPasswordSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(4, 'A reason is required for this change.')
    .max(1000),
});
export type ResetPortalPasswordInput = z.infer<
  typeof resetPortalPasswordSchema
>;

/** `POST /api-clients/:id/portal-account`, by the administrator. */
export const createPortalAccountSchema = z.object({
  email,
  fullName: personName,
});
export type CreatePortalAccountInput = z.infer<
  typeof createPortalAccountSchema
>;

/**
 * How the applicant was confirmed, recorded with the approval of an
 * organisation that applied for itself.
 */
export const applicantConfirmationSchema = z.object({
  via: z.enum(APPLICANT_CONFIRMATIONS),
  note: z.string().trim().max(500).optional(),
});
export type ApplicantConfirmationInput = z.infer<
  typeof applicantConfirmationSchema
>;

export const APPLICANT_CONFIRMATION_LABELS: Readonly<
  Record<(typeof APPLICANT_CONFIRMATIONS)[number], string>
> = {
  TELEPHONE: 'By telephone',
  LETTER: 'By letter',
};

/** What the organisation is told its requests came to. */
export const PORTAL_USAGE_LABELS: Readonly<Record<PortalUsageClass, string>> = {
  MATCH: 'Matches',
  NO_MATCH: 'No match',
  TOTALS: 'Totals and metadata',
  LIMITED: 'Stopped by a limit',
  REFUSED: 'Credential refused',
  INVALID_REQUEST: 'Malformed requests',
  OTHER: 'Other',
};

/** A portal account, as the administrator sees it. No secret is in it. */
export interface PortalAccountSummary {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  /** On a temporary password the administrator gave. */
  mustChangePassword: boolean;
  /** Locked for a time after repeated failed sign-ins. */
  locked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/**
 * A portal account with a password the System generated. Returned once, to
 * the administrator, who passes it on.
 */
export interface IssuedPortalPassword {
  account: PortalAccountSummary;
  temporaryPassword: string;
}

/** `GET /portal/me`: who is signed in, and where their organisation stands. */
export interface PortalMe {
  account: {
    email: string;
    fullName: string;
    mustChangePassword: boolean;
  };
  organisation: {
    name: string;
    /** As shown: an approved organisation whose token has run out reads `EXPIRED`. */
    status: ApiClientStatus;
    appliedAt: string;
    /** When an application nobody has approved lapses; `null` once decided. */
    applicationExpiresAt: string | null;
    approvedAt: string | null;
    scopes: string[];
    /** What its answers may carry. */
    disclosureProfile: { label: string; fields: string[] } | null;
    limits: {
      verificationPerMinute: number;
      aggregatePerMinute: number;
      burst: number;
      dailyQuota: number;
      usedToday: number;
    } | null;
    /** Requests are stopped until then. Why is not shown. */
    pausedUntil: string | null;
  };
}

/** One Lagos day of the organisation's own requests. */
export interface PortalUsageDay {
  /** `YYYY-MM-DD`. */
  day: string;
  total: number;
  byClass: Record<PortalUsageClass, number>;
}

/** `GET /portal/usage`. Oldest day first; every day in the range is present. */
export interface PortalUsage {
  days: PortalUsageDay[];
  totals: Record<PortalUsageClass, number>;
  total: number;
}

/** `GET /portal/tokens`. Newest first. */
export interface PortalTokens {
  tokens: ApiTokenSummary[];
  /** `false` until the organisation is approved and active. */
  canManage: boolean;
}

// --- Invitations (item 33) ----------------------------------------------------

/**
 * `POST /organisation-invitations` (PRD Requirement 12.11, revision 1.10;
 * EXT-21). The name is who the form will be addressed to; the contact, if
 * given, is whom the administrator expects to hear from. An invitation
 * confirms nobody: the application it produces is confirmed by telephone or
 * letter and decided as any other.
 */
export const createInvitationSchema = z.object({
  organisationName: z
    .string()
    .trim()
    .min(2, 'The organisation’s name is required.')
    .max(200),
  contactName: personName.optional(),
  contactEmail: email.optional(),
  contactPhone: z
    .string()
    .trim()
    .min(7, 'Give the whole telephone number.')
    .max(40)
    .optional(),
  note: z
    .string()
    .trim()
    .max(500, 'Keep the note under 500 characters.')
    .optional(),
});
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

/** `POST /organisation-invitations/:id/withdrawal`. */
export const withdrawInvitationSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(4, 'Give a reason of at least 4 characters.')
    .max(1000, 'A reason may not exceed 1000 characters.'),
});
export type WithdrawInvitationInput = z.infer<typeof withdrawInvitationSchema>;

export interface InvitationSummary {
  id: string;
  /** The link is `/portal/apply?invite={code}` on the web application. */
  code: string;
  organisationName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  note: string | null;
  /** Worked out from the dates, never stored. */
  standing: InvitationStanding;
  createdAt: string;
  expiresAt: string;
  createdBy: string | null;
  /** The application it produced; its organisation, while that record exists. */
  used: { at: string; apiClientId: string | null } | null;
  withdrawn: { at: string; by: string | null; reason: string | null } | null;
}

/** `GET /organisation-invitations`. Newest first. */
export interface InvitationList {
  invitations: InvitationSummary[];
  /** How long a new link lasts, in days (`portal.invitation_expiry_days`). */
  expiryDays: number;
}

/** `GET /portal/invitations/:code`: who the form is addressed to, and until when. */
export interface PublicInvitation {
  organisationName: string;
  expiresAt: string;
}
