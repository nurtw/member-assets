/**
 * @nurtw/contracts — shared types consumed by both the API and the web application.
 *
 * ARCHITECTURE.md Decision 3.1: response types are declared once here and imported
 * by the web application, so that a change to a response shape produces a compile
 * error rather than a runtime defect.
 *
 * Zod schemas live here too (ARCHITECTURE.md §3), introduced at item 04 where the
 * first request bodies large enough to warrant them appear. The API validates
 * against them and the dashboard reuses them for forms, so one definition governs
 * both sides of every request.
 */

export {
  CARD_STATUSES,
  DECLARATION_STATUSES,
  STICKER_STATUSES,
  VERIFIABLE_DECLARATION_STATUSES,
  VERIFIABLE_STICKER_STATUSES,
  type CardStatus,
  type DeclarationStatus,
  type StickerStatus,
} from './statuses.js';

export {
  ANAMBRA_LGA_SEED,
  ANAMBRA_STATE_NAME,
  DESIGNATION_SEED,
  LEGACY_VEHICLE_CATEGORY_SEED,
  ORGANISATION_LEVELS,
  type MasterDataSeedEntry,
  type OrganisationLevel,
} from './master-data.js';

export { loginSchema, type LoginInput } from './auth.js';

export {
  MASTER_DATA_COLLECTIONS,
  createLgaSchema,
  createMasterDataSchema,
  createOrganisationSchema,
  moveOrganisationSchema,
  organisationLevelSchema,
  setOrganisationActiveSchema,
  updateLgaSchema,
  updateMasterDataSchema,
  updateOrganisationSchema,
  type CreateLgaInput,
  type CreateMasterDataInput,
  type CreateOrganisationInput,
  type LgaEntry,
  type MasterDataCollection,
  type MasterDataEntry,
  type MoveOrganisationInput,
  type OrganisationNode,
  type OrganisationTreeNode,
  type SetOrganisationActiveInput,
  type UpdateLgaInput,
  type UpdateMasterDataInput,
  type UpdateOrganisationInput,
} from './organisation.js';

export {
  AGGREGATE_FILTERED_SCOPE,
  AGGREGATE_TOTAL_SCOPE,
  API_SCOPES,
  DEFAULT_AGGREGATE_SUPPRESSION_FLOOR,
  DEFAULT_TOKEN_EXPIRY_DAYS,
  type ApiScope,
} from './scopes.js';

export {
  DECLARE_PERMISSION,
  PERMISSIONS,
  PERMISSION_CODES,
  SYSTEM_ROLES,
  type PermissionCode,
  type PermissionDefinition,
  type RoleDefinition,
  type SystemRoleCode,
} from './permissions.js';

export {
  APPLICATION_DECISIONS,
  applicantSchema,
  attachMediaSchema,
  createApplicationSchema,
  guarantorSchema,
  nextOfKinSchema,
  organisationalAssignmentSchema,
  reviewApplicationSchema,
  setMemberStatusSchema,
  updateApplicationSchema,
  withdrawApplicationSchema,
  type ApplicantInput,
  type ApplicationDecision,
  type ApplicationDetail,
  type ApplicationSummary,
  type AttachMediaInput,
  type CreateApplicationInput,
  type GuarantorInput,
  type MemberSearchResult,
  type NextOfKinInput,
  type OrganisationalAssignmentInput,
  type ReviewApplicationInput,
  type SetMemberStatusInput,
  type UpdateApplicationInput,
  type WithdrawApplicationInput,
} from './membership.js';

export {
  OFFICER_SIGNATURE_POSITIONS,
  createOfficerSignatureSchema,
  decideCardSchema,
  draftCardSchema,
  officerSignaturePositionSchema,
  replaceCardSchema,
  setCardStatusSchema,
  updateCardSchema,
  type CardDetail,
  type CardSummary,
  type CreateOfficerSignatureInput,
  type DecideCardInput,
  type DraftCardInput,
  type OfficerSignaturePosition,
  type OfficerSignatureRecord,
  type ReplaceCardInput,
  type SetCardStatusInput,
  type UpdateCardInput,
} from './card.js';

export {
  SETTABLE_DECLARATION_STATUSES,
  declareVehicleSchema,
  dismissDisputeSchema,
  setDeclarationStatusSchema,
  updateVehicleSchema,
  type DeclareVehicleInput,
  type DismissDisputeInput,
  type SetDeclarationStatusInput,
  type UpdateVehicleInput,
  type VehicleDetail,
  type VehicleSummary,
} from './vehicle.js';
