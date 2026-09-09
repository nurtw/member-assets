/**
 * @nurtw/contracts — shared types consumed by both the API and the web application.
 *
 * ARCHITECTURE.md Decision 3.1: response types are declared once here and imported
 * by the web application, so that a change to a response shape produces a compile
 * error rather than a runtime defect.
 *
 * Zod schemas belong here too (ARCHITECTURE.md §3) but are deferred to roadmap
 * item 02, when there are concrete DTOs to validate. Adding the dependency before
 * there is anything to validate would be premature.
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
  LEGACY_VEHICLE_CATEGORY_SEED,
  ORGANISATION_LEVELS,
  type MasterDataSeedEntry,
  type OrganisationLevel,
} from './master-data.js';

export {
  AGGREGATE_FILTERED_SCOPE,
  AGGREGATE_TOTAL_SCOPE,
  API_SCOPES,
  DEFAULT_AGGREGATE_SUPPRESSION_FLOOR,
  DEFAULT_TOKEN_EXPIRY_DAYS,
  type ApiScope,
} from './scopes.js';
