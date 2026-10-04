/**
 * Officer accounts, the access given to them, and the second factor (PRD §16,
 * §17.1 — item 28).
 *
 * A password is never in a response except a temporary one, once, to the
 * administrator who issued it. A second-factor secret and its recovery codes
 * are shown once, to the officer they belong to.
 */

import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  isGrantOnly,
} from '@nurtw/domain';
import { z } from 'zod';

import { PERMISSION_CODES } from './permissions.js';

const uuid = z.uuid('A valid identifier is required.');

/** Every change to an account or its access is audited with a reason. */
const reason = z
  .string()
  .trim()
  .min(4, 'A reason is required for this change.')
  .max(1000);

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(320)
  .pipe(z.email('A valid email address is required.'));

const fullName = z.string().trim().min(2, 'A name is required.').max(200);

/** A permission from the catalogue, and nothing else. */
const permissionCode = z
  .string()
  .refine(
    (code) => PERMISSION_CODES.includes(code),
    'That is not a permission in the catalogue.',
  );

/** `POST /users` — the System issues the temporary password. */
export const createUserSchema = z.object({ email, fullName });
export type CreateUserInput = z.infer<typeof createUserSchema>;

/** `PATCH /users/:id` — the name and the address, never the access. */
export const updateUserSchema = z
  .object({ email: email.optional(), fullName: fullName.optional(), reason })
  .refine(
    (value) => value.email !== undefined || value.fullName !== undefined,
    { message: 'Change at least one detail.' },
  );
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** `POST /users/:id/status` — deactivate, or reactivate. */
export const setUserStatusSchema = z.object({ isActive: z.boolean(), reason });
export type SetUserStatusInput = z.infer<typeof setUserStatusSchema>;

/**
 * A body that carries only the reason: resetting a password or a second
 * factor, removing a role, withdrawing a grant, lifting a revocation.
 */
export const reasonSchema = z.object({ reason });
export type ReasonInput = z.infer<typeof reasonSchema>;

/** `POST /users/:id/roles` — a role, within one part of the Union. */
export const assignRoleSchema = z.object({
  roleCode: z.string().trim().min(1).max(60),
  organisationId: uuid,
  reason,
});
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;

/**
 * `POST /users/:id/grants` and `POST /users/:id/revocations` — one permission,
 * within one part of the Union. A revocation takes it away there even where a
 * role gives it (Decision 9.3: revocation always wins).
 */
export const scopedPermissionSchema = z.object({
  permission: permissionCode,
  organisationId: uuid,
  reason,
});
export type ScopedPermissionInput = z.infer<typeof scopedPermissionSchema>;

/**
 * The permissions a role the Union composes may hold: any in the catalogue
 * except those given only by express grant (PRD §9.5, Requirement 27.12).
 */
const rolePermissions = z
  .array(
    permissionCode.refine(
      (code) => !isGrantOnly(code),
      'That permission is given only by an express grant to a named person, never by a role.',
    ),
  )
  .min(1, 'Give the role at least one permission.')
  .transform((codes) => [...new Set(codes)]);

const roleLabel = z.string().trim().min(2, 'A name is required.').max(120);
const roleDescription = z.string().trim().max(500);

/** `POST /roles` — a role composed from the catalogue. The code is fixed. */
export const createRoleSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(
      /^[A-Z][A-Z0-9_]{2,49}$/,
      'Use capital letters, digits, and underscores, starting with a letter.',
    ),
  label: roleLabel,
  description: roleDescription.optional(),
  permissions: rolePermissions,
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

/**
 * `PUT /roles/:code` — replaces a composed role's permissions. It changes
 * what every holder may do, from their next request.
 */
export const updateRoleSchema = z.object({
  label: roleLabel,
  description: roleDescription.optional(),
  permissions: rolePermissions,
  reason,
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

/** A password an officer chooses. The account-specific rules are the API's. */
const newPassword = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(MAX_PASSWORD_LENGTH);

/** `POST /auth/password` — the officer's own. */
export const changePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, 'Your current password is required.')
    .max(1024),
  newPassword,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** A six-digit code from the authenticator app, or a recovery code. */
const secondFactorCode = z.string().trim().min(6).max(40);

/** `POST /auth/mfa/confirm` and `POST /auth/mfa/verify`. */
export const secondFactorSchema = z.object({ code: secondFactorCode });
export type SecondFactorInput = z.infer<typeof secondFactorSchema>;

// --- Shapes --------------------------------------------------------------------

export interface OrganisationRef {
  id: string;
  name: string;
  level: string;
}

export interface UserRoleAssignmentSummary {
  id: string;
  role: { code: string; label: string };
  organisation: OrganisationRef;
  createdAt: string;
}

export interface UserScopedPermission {
  id: string;
  permission: string;
  organisation: OrganisationRef;
  reason: string;
  by: { id: string; fullName: string } | null;
  createdAt: string;
}

export interface UserSummary {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  /** Still on a temporary password. */
  mustChangePassword: boolean;
  /** Has an authenticator app set up. */
  secondFactorEnrolled: boolean;
  roles: UserRoleAssignmentSummary[];
  createdAt: string;
}

export interface UserDetail extends UserSummary {
  grants: UserScopedPermission[];
  revocations: UserScopedPermission[];
}

/**
 * The response to creating an account or resetting its password. The
 * temporary password is returned this once and stored only as a hash.
 */
export interface IssuedTemporaryPassword {
  user: UserDetail;
  temporaryPassword: string;
}

export interface RoleSummary {
  code: string;
  label: string;
  description: string | null;
  /** One of the roles of PRD §16, which cannot be changed. */
  isSystem: boolean;
  permissions: string[];
  /** How many assignments name it. */
  assignmentCount: number;
}

/** The signed-in officer's own account state, on `GET /auth/me`. */
export interface AccountState {
  mustChangePassword: boolean;
  secondFactor: {
    enrolled: boolean;
    /** This session has proved it. */
    verified: boolean;
    /** They hold a privileged permission, and enforcement is on. */
    required: boolean;
  };
}

/** `POST /auth/mfa/enrol` — shown once, before the code confirms it. */
export interface SecondFactorEnrolment {
  /** The key to type into an authenticator app. */
  secret: string;
  /** The same, as a link an authenticator app opens. */
  otpauthUri: string;
}

/** `POST /auth/mfa/confirm` — the recovery codes, shown once. */
export interface SecondFactorConfirmed {
  recoveryCodes: string[];
}

/** `PUT /settings/security/second-factor`. */
export const setSecondFactorEnforcementSchema = z.object({
  enforced: z.boolean(),
  reason,
});
export type SetSecondFactorEnforcementInput = z.infer<
  typeof setSecondFactorEnforcementSchema
>;

/** `GET /settings/security`. */
export interface SecuritySettings {
  /** A privileged permission needs a second-factor session (Requirement 17.1). */
  secondFactorEnforced: boolean;
  /** Active officers holding a privileged permission with no second factor. */
  privilegedWithoutSecondFactor: {
    id: string;
    fullName: string;
    email: string;
  }[];
}
