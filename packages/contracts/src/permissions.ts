/**
 * The permission catalogue and the seeded role bundles.
 *
 * ARCHITECTURE.md Decision 9.2 — permissions are the atomic unit of
 * authorisation; roles are administrative bundles and are never consulted in an
 * authorisation decision. Code asks whether the actor holds `vehicle.declare`,
 * never whether they are a Vehicle-Record Officer.
 *
 * These constants seed the `permission` and `role` tables. They are the *initial*
 * state, not the runtime authority: Decision 9.2 keeps the catalogue in the
 * database so a permission can be introduced without a schema migration, and
 * Decision 9.5 lets a super administrator compose additional roles. Application
 * code must read effective permissions from the database, never from this file.
 */

export interface PermissionDefinition {
  readonly code: string;
  readonly description: string;
  /**
   * Decision 9.7.3 — step-up re-authentication is built and available per
   * permission. Nothing enables it at present; `vehicle.declare` was expressly
   * determined not to require it.
   */
  readonly requiresStepUp?: boolean;
}

export const PERMISSIONS = [
  // Organisation and master data ------------------------------------------------
  {
    code: 'organisation.read',
    description: 'View the organisational hierarchy',
  },
  {
    code: 'organisation.manage',
    description: 'Create and amend councils, zones, branches, and units',
  },
  {
    code: 'master_data.read',
    description:
      'View designations, vehicle categories, and local government areas',
  },
  {
    code: 'master_data.manage',
    description:
      'Amend designations, vehicle categories, and local government areas',
  },

  // Membership ------------------------------------------------------------------
  { code: 'application.read', description: 'View membership applications' },
  {
    code: 'application.review',
    description: 'Take an application under review',
  },
  {
    code: 'application.decide',
    description: 'Approve or reject a membership application',
  },
  {
    code: 'member.read',
    description: 'View member records and card-display data',
  },
  { code: 'member.create', description: 'Create a member record' },
  { code: 'member.update', description: 'Amend a member record' },
  { code: 'member.suspend', description: 'Suspend or cancel a member' },
  /**
   * PRD Requirement 7.1 — next of kin, guarantor, collateral, telephone, and
   * residential address are held apart from card-display data and are never
   * reachable through a verification path. This permission gates the only route
   * to them.
   */
  {
    code: 'member_sensitive.read',
    description: 'View next-of-kin, guarantor, and contact details',
  },

  // Cards -----------------------------------------------------------------------
  { code: 'card.read', description: 'View membership cards' },
  { code: 'card.issue', description: 'Issue a membership card' },
  { code: 'card.approve', description: 'Approve a card for issuance' },
  { code: 'card.replace', description: 'Replace a lost or damaged card' },
  { code: 'card.suspend', description: 'Suspend or cancel a card' },
  {
    code: 'card_template.manage',
    description: 'Manage card templates and officer signature assets',
  },

  // Vehicles --------------------------------------------------------------------
  { code: 'vehicle.read', description: 'View vehicle declarations' },
  /**
   * PRD §9.5 and ARCHITECTURE.md Decision 9.7 — declaration is a manual,
   * deliberate act. This permission is seeded into the SUPER ADMINISTRATOR
   * bundle and no other, reaching anyone else only by express per-user grant.
   */
  { code: 'vehicle.declare', description: 'Create a vehicle declaration' },
  { code: 'vehicle.update', description: 'Amend a vehicle declaration' },
  {
    code: 'vehicle.suspend',
    description: 'Suspend or retire a vehicle declaration',
  },
  {
    code: 'vehicle.resolve_dispute',
    description: 'Resolve a disputed declaration',
  },
  /** PRD Requirement 9.4 — chassis and VIN are restricted and never externally disclosed. */
  {
    code: 'vehicle.read_restricted',
    description: 'View restricted vehicle identifiers (chassis/VIN)',
  },

  // Stickers --------------------------------------------------------------------
  { code: 'sticker.read', description: 'View vehicle stickers' },
  { code: 'sticker.issue', description: 'Issue a vehicle sticker' },
  {
    code: 'sticker.replace',
    description: 'Replace a lost, damaged, or expired sticker',
  },
  { code: 'sticker.suspend', description: 'Suspend or cancel a sticker' },
  {
    code: 'sticker.manage_stock',
    description: 'Manage sticker stock and identifier generation',
  },
  /**
   * PRD §9A.2 / `QUESTIONS.md` VEH-18 — attaching a sticker to a vehicle is
   * onboarding, and is deliberately distinct from `vehicle.declare`: a
   * vehicle can be onboarded and declared by different people, in either
   * order. Seeded into SUPER_ADMINISTRATOR alone, same reasoning as
   * `vehicle.declare`.
   */
  {
    code: 'sticker.attach',
    description: 'Attach a sticker to a vehicle (onboarding)',
  },

  // Payments (PRD §27) ------------------------------------------------------
  { code: 'payment.read', description: 'View payments and the ledger' },
  {
    code: 'payment.initiate',
    description: 'Start a payment for a fee type (link or dedicated account)',
  },
  /** PRD Requirement 27.14 / PAY-08 — refunds are exceptional, not routine. */
  {
    code: 'payment.refund',
    description: 'Refund a failed, duplicate, or wrong-subject payment',
  },
  { code: 'fee_type.manage', description: 'Create and amend fee types and their amounts' },
  /**
   * PRD Requirement 27.12 / PAY-13 — the single most valuable action in the
   * System to an attacker, since it redirects every future due. Seeded into
   * SUPER_ADMINISTRATOR alone. `requiresStepUp` is the password re-entry
   * PAY-13 asked for; no second approver is required, so the audit trail
   * (mandatory reason, before/after, failed attempts) is the control instead.
   */
  {
    code: 'payment.manage_settlement',
    description: 'Add or change the NURTW Paystack settlement account',
    requiresStepUp: true,
  },

  // Verification ----------------------------------------------------------------
  { code: 'verification.perform', description: 'Verify by plate, QR, or both' },
  {
    code: 'verification.membership',
    description: 'Verify a membership or card number',
  },

  // External API ----------------------------------------------------------------
  { code: 'api_client.read', description: 'View external API clients' },
  {
    code: 'api_client.manage',
    description: 'Register, approve, suspend, and revoke external clients',
  },
  {
    code: 'api_token.manage',
    description: 'Issue, rotate, and revoke API tokens',
  },
  { code: 'disclosure_profile.read', description: 'View disclosure profiles' },
  {
    code: 'disclosure_profile.manage',
    description: 'Create and amend disclosure profiles',
  },

  // Reporting -------------------------------------------------------------------
  { code: 'aggregate.read', description: 'View approved aggregate totals' },
  {
    code: 'report.read',
    description: 'View operational reports and dashboards',
  },

  // Audit and security ----------------------------------------------------------
  { code: 'audit.read', description: 'Read the audit trail' },
  { code: 'audit.export', description: 'Export audit records' },
  {
    code: 'rate_limit.manage',
    description: 'Amend rate limits, quotas, and suppression thresholds',
  },
  {
    code: 'security.monitor',
    description: 'View security monitoring and abuse detection',
  },

  // Users and permissions -------------------------------------------------------
  { code: 'user.read', description: 'View internal user accounts' },
  {
    code: 'user.manage',
    description: 'Create, amend, and deactivate internal users',
  },
  { code: 'role.read', description: 'View roles and their permission bundles' },
  { code: 'role.manage', description: 'Compose and amend custom roles' },
  {
    code: 'permission.read',
    description: 'View who holds which permission, and in what scope',
  },
  {
    code: 'permission.grant',
    description: 'Grant an individual permission to a user',
  },
  {
    code: 'permission.revoke',
    description: 'Revoke an individual permission from a user',
  },
  { code: 'system_setting.manage', description: 'Amend runtime configuration' },
] as const satisfies readonly PermissionDefinition[];

export type PermissionCode = (typeof PERMISSIONS)[number]['code'];

export const PERMISSION_CODES: readonly string[] = PERMISSIONS.map(
  (p) => p.code,
);

/**
 * The permission that must never be seeded broadly.
 *
 * Exported so the seed and its tests reference one constant rather than
 * repeating the string, and so a search for it lands here.
 */
export const DECLARE_PERMISSION = 'vehicle.declare' satisfies PermissionCode;

/** PRD §9A.2 / VEH-18 — onboarding, distinct from `vehicle.declare`. */
export const ATTACH_STICKER_PERMISSION =
  'sticker.attach' satisfies PermissionCode;

/** PRD Requirement 27.12 / PAY-13 — the settlement-account change permission. */
export const MANAGE_SETTLEMENT_PERMISSION =
  'payment.manage_settlement' satisfies PermissionCode;

export interface RoleDefinition {
  readonly code: string;
  readonly label: string;
  readonly description: string;
  readonly permissions: readonly PermissionCode[];
}

/**
 * The eleven roles of PRD §16, seeded as immutable system roles.
 *
 * Decision 9.5 — these cannot be edited or deleted, so a misconfiguration cannot
 * silently broaden a role the Union believes it understands. A super
 * administrator may compose additional roles from the catalogue.
 *
 * Note what is absent as much as what is present. `vehicle.declare` appears in
 * SUPER_ADMINISTRATOR alone. The Vehicle-Record Officer can read and amend
 * declarations but cannot create one; the Verification Officer holds no write
 * permission at all, which is PRD §9.5–9.6 expressed as data.
 */
export const SYSTEM_ROLES = [
  {
    code: 'SUPER_ADMINISTRATOR',
    label: 'Super administrator',
    description:
      'System configuration, user and organisation management, security settings, and emergency controls.',
    permissions: PERMISSION_CODES as readonly PermissionCode[],
  },
  {
    code: 'MEMBERSHIP_ADMINISTRATOR',
    label: 'Membership administrator',
    description:
      'Applications, member records, approval workflows, and member status.',
    permissions: [
      'organisation.read',
      'master_data.read',
      'application.read',
      'application.review',
      'application.decide',
      'member.read',
      'member.create',
      'member.update',
      'member.suspend',
      'member_sensitive.read',
      'card.read',
      'report.read',
    ],
  },
  {
    code: 'BRANCH_UNIT_ADMINISTRATOR',
    label: 'Branch or unit administrator',
    description: 'Records within the assigned organisational scope.',
    permissions: [
      'organisation.read',
      'master_data.read',
      'application.read',
      'application.review',
      'member.read',
      'member.update',
      'card.read',
      'vehicle.read',
      'vehicle.update',
      'sticker.read',
      'report.read',
    ],
  },
  {
    code: 'CARD_ADMINISTRATOR',
    label: 'Card administrator',
    description:
      'Card templates, card issuance, replacement, and status management.',
    permissions: [
      'organisation.read',
      'master_data.read',
      'member.read',
      'card.read',
      'card.issue',
      'card.approve',
      'card.replace',
      'card.suspend',
      'card_template.manage',
    ],
  },
  {
    code: 'STICKER_ADMINISTRATOR',
    label: 'Sticker administrator',
    description:
      'Sticker stock, QR identifiers, issuance, replacement, and status management.',
    permissions: [
      'organisation.read',
      'master_data.read',
      'vehicle.read',
      'sticker.read',
      'sticker.issue',
      'sticker.replace',
      'sticker.suspend',
      'sticker.manage_stock',
    ],
  },
  {
    code: 'VEHICLE_RECORD_OFFICER',
    label: 'Vehicle-record officer',
    description:
      'Vehicle declarations and controlled updates within assigned scope. Creating a declaration requires an express grant of vehicle.declare.',
    permissions: [
      'organisation.read',
      'master_data.read',
      'member.read',
      'vehicle.read',
      'vehicle.update',
      'vehicle.suspend',
      'vehicle.read_restricted',
      'sticker.read',
    ],
  },
  {
    code: 'VERIFICATION_OFFICER',
    label: 'Verification officer',
    description:
      'Plate, QR, and membership verification without unnecessary editing rights.',
    permissions: [
      'verification.perform',
      'verification.membership',
      'vehicle.read',
      'sticker.read',
    ],
  },
  {
    code: 'FINANCE_OPERATIONS_OFFICER',
    label: 'Finance or operations officer',
    description:
      'Operational reports and approved aggregate totals; no unrestricted personal-data access.',
    permissions: [
      'report.read',
      'aggregate.read',
      'organisation.read',
      'master_data.read',
      'payment.read',
      'payment.initiate',
    ],
  },
  {
    code: 'AUDITOR',
    label: 'Auditor',
    description: 'Read-only access to approved records and audit logs.',
    permissions: [
      'audit.read',
      'audit.export',
      'organisation.read',
      'master_data.read',
      'member.read',
      'card.read',
      'vehicle.read',
      'sticker.read',
      'api_client.read',
      'disclosure_profile.read',
      'permission.read',
      'role.read',
      'user.read',
      'report.read',
    ],
  },
  {
    code: 'API_ADMINISTRATOR',
    label: 'API administrator',
    description:
      'External client approval, token rotation, scopes, quotas, and API audit review.',
    permissions: [
      'api_client.read',
      'api_client.manage',
      'api_token.manage',
      'disclosure_profile.read',
      'disclosure_profile.manage',
      'audit.read',
      'organisation.read',
    ],
  },
  {
    code: 'SECURITY_ADMINISTRATOR',
    label: 'Security administrator',
    description:
      'Threat monitoring, rate-limit rules, incident response, and access review.',
    permissions: [
      'security.monitor',
      'rate_limit.manage',
      'audit.read',
      'audit.export',
      'user.read',
      'role.read',
      'permission.read',
      'api_client.read',
      'organisation.read',
    ],
  },
] as const satisfies readonly RoleDefinition[];

export type SystemRoleCode = (typeof SYSTEM_ROLES)[number]['code'];
