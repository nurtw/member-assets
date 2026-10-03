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
  RECORD_BLOCKING_STATUSES,
  assertDeclarationTransition,
  blocksNewRecord,
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

export {
  resolveFeeAmountAtKobo,
  resolveFeeAmountKobo,
  type FeeAmountChange,
} from './payments/fee-amount.js';

export {
  DUES_STATUSES,
  addTwelveMonths,
  lagosMonthLabel,
  levySchedule,
  membershipCover,
  routeTypeInForce,
  type DuesStatus,
  type LevyMonth,
  type LevySchedule,
  type MembershipCover,
  type MembershipPayment,
  type RouteTypeChange,
} from './payments/dues.js';

export {
  ALLOCATION_ORDERS,
  allocateCredit,
  parseAllocationOrder,
  type Allocation,
  type AllocationOrder,
  type AllocationResult,
  type OutstandingDue,
} from './payments/allocation.js';

export {
  amountToSendKobo,
  dedicatedCreditKobo,
  percentageToBasisPoints,
} from './payments/dedicated-amount.js';

export {
  InvalidStickerTransitionError,
  STICKER_STATUSES,
  assertStickerTransition,
  canTransitionSticker,
  isStickerAttached,
  isStickerFinal,
  isStickerVerifiable,
  type StickerStatus,
} from './sticker/status.js';

export {
  ONBOARDING_FEE_TYPE_CODES,
  checkAttachment,
  requiredOnboardingFeeType,
  type AttachmentCheck,
  type AttachmentContext,
  type AttachmentRefusalReason,
} from './sticker/attachment.js';

export {
  RECOGNISED_NOT_ATTACHED_COPY,
  TRANSPAY_ATTACHED_COPY,
  describeLegacyBarcode,
  type LegacyBarcodeReading,
  type LegacyRegisterEntry,
} from './sticker/legacy-lookup.js';

export {
  decodeAndVerifyQrPayload,
  encodeQrPayload,
  stickerCodeScheme,
  type HmacSigner,
  type QrPayload,
  type QrVerificationResult,
} from './sticker/qr-signing.js';

export {
  MATCH_STATEMENTS,
  NOT_VERIFIED_REASONS,
  NO_MATCH_STATEMENT,
  VERIFICATION_CRITERIA,
  VERIFICATION_LIMITATION,
  decideVerification,
  discloseReasons,
  type DisclosedReason,
  type NotVerifiedReason,
  type VerificationCriteria,
  type VerificationFacts,
  type VerificationSticker,
  type VerificationVehicle,
  type VerificationVerdict,
} from './verification/verdict.js';

export {
  VERIFICATION_FIELDS,
  VERIFICATION_FIELD_NAMES,
  projectVerification,
  type ProjectedVerification,
  type VerificationChannel,
  type VerificationField,
  type VerificationFieldTier,
  type VerificationValues,
} from './verification/projection.js';

export {
  MEMBERSHIP_LIMITATION,
  MEMBERSHIP_MATCH_STATEMENT,
  MEMBERSHIP_NOT_VERIFIED_REASONS,
  decideMembershipVerification,
  type MembershipFacts,
  type MembershipLookup,
  type MembershipNotVerifiedReason,
  type MembershipVerdict,
} from './verification/membership.js';
