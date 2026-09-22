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

export {
  InvalidHierarchyError,
  ORGANISATION_LEVELS,
  assertMoveIsAcyclic,
  assertValidPlacement,
  canContain,
  childLevelOf,
  childPath,
  idFromPath,
  isMoveAcyclic,
  isOrganisationLevel,
  levelDepth,
  outermostScopes,
  parentLevelOf,
  parentPathOf,
  rewriteDescendantPath,
  type OrganisationLevel,
} from './organisation/hierarchy.js';

export {
  IDENTIFIER_ALPHABET,
  InvalidIdentifierError,
  checkSymbol,
  formatIdentifier,
  generateIdentifier,
  isValidIdentifier,
  normalizeIdentifier,
  parseIdentifier,
  type RandomByteSource,
} from './identifiers/human-identifier.js';

export {
  APPLICATION_STATUSES,
  InvalidStatusTransitionError,
  MEMBER_STATUSES,
  assertApplicationTransition,
  assertMemberTransition,
  canTransitionApplication,
  canTransitionMember,
  isApplicationEditable,
  isApplicationFinal,
  isMemberFinal,
  isMemberInGoodStanding,
  type ApplicationStatus,
  type MemberStatus,
} from './membership/status.js';

export {
  InvalidPhoneNumberError,
  NIGERIA_COUNTRY_CODE,
  formatNigerianPhone,
  isNigerianPhone,
  normalizeNigerianPhone,
  tryNormalizeNigerianPhone,
} from './contact/phone-number.js';

export {
  CARD_STATUSES,
  InvalidCardTransitionError,
  LIVE_CARD_STATUSES,
  REPLACEABLE_CARD_STATUSES,
  assertCardTransition,
  canTransitionCard,
  expiryDateFor,
  isCardFinal,
  isCardIssued,
  isCardLive,
  isCardReplaceable,
  isCardVerifiable,
  type CardStatus,
} from './card/status.js';

export {
  CARD_ADDRESS_LENGTH,
  suggestCardAddress,
} from './card/display-address.js';

export {
  DECLARATION_STATUSES,
  InvalidDeclarationTransitionError,
  assertDeclarationTransition,
  canTransitionDeclaration,
  isDeclarationFinal,
  isDeclarationLive,
  type DeclarationStatus,
} from './vehicle/status.js';

export {
  DEFAULT_FEE_SCHEDULES,
  calculateContractorFee,
  calculateFees,
  type ContractorFeeRule,
  type FeeCalculationInput,
  type FeeCalculationResult,
  type PaystackFeeSchedule,
} from './payments/fee-rule.js';
