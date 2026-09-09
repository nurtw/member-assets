/**
 * @nurtw/domain — framework-independent domain rules.
 *
 * ARCHITECTURE.md Decision 3.2: this package must not depend on NestJS, Prisma, or
 * Next.js. It holds the rules that carry the greatest correctness risk — plate
 * normalisation, disclosure projection, status-transition validity, and identifier
 * generation — so they remain independently testable and survive a framework change.
 *
 * Adding a dependency on a framework here is a design error, not a convenience.
 */

export {
  InvalidPlateNumberError,
  MAX_NORMALIZED_PLATE_LENGTH,
  MIN_NORMALIZED_PLATE_LENGTH,
  isNormalizedPlateNumber,
  normalizePlateNumber,
  tryNormalizePlateNumber,
} from './plate-number.js';

export {
  InvalidOrganisationPathError,
  PATH_SEPARATOR,
  anyScopeContains,
  buildOrganisationPath,
  scopeContains,
  type OrganisationPath,
} from './permissions/organisation-scope.js';

export {
  decidePermission,
  hasPermission,
  hasPermissionAnywhere,
  listEffectivePermissions,
  type PermissionAssignments,
  type PermissionCode,
  type PermissionDecision,
  type PermissionQuery,
  type ScopedPermission,
} from './permissions/effective-permissions.js';
