/**
 * Organisation and master-data request schemas.
 *
 * ARCHITECTURE.md Decision 3.1 — declared once and consumed by both applications:
 * the API validates incoming bodies against these, and the dashboard uses the
 * same objects for form validation and inferred types. A field added here reaches
 * both sides, and a field the API stops accepting fails the web build rather than
 * failing silently at runtime.
 *
 * Validation is not authorisation. Nothing in this file decides who may perform
 * an action; that is `PermissionService` reading `@nurtw/domain`. These schemas
 * only decide whether a request is well formed.
 */

import { ORGANISATION_LEVELS } from '@nurtw/domain';
import { z } from 'zod';

/**
 * A trimmed, non-empty display name.
 *
 * Trimmed before length is measured, so a name of spaces is rejected rather than
 * stored as blank. The 160-character ceiling is a storage bound, not a
 * presentation one — the Union names its own bodies.
 */
const displayName = z
  .string()
  .trim()
  .min(1, 'A name is required.')
  .max(160, 'A name may not exceed 160 characters.');

const uuid = z.uuid('A valid identifier is required.');

/**
 * A master-data code.
 *
 * Constrained to upper-case letters, digits, and underscores because a code is a
 * foreign key in all but name: it appears in seeds, in the legacy import mapping,
 * and in operational queries. Permitting punctuation or case variation would make
 * `Bus_Intrastate` and `BUS_INTRASTATE` two categories that read as one.
 */
const masterDataCode = z
  .string()
  .trim()
  .min(2, 'A code is required.')
  .max(64, 'A code may not exceed 64 characters.')
  .regex(
    /^[A-Z][A-Z0-9_]*$/,
    'A code must be upper-case letters, digits, and underscores, beginning with a letter.',
  );

export const organisationLevelSchema = z.enum(ORGANISATION_LEVELS);

/**
 * Creating a node.
 *
 * `parentId` is nullable rather than optional: placing a node at the root is a
 * deliberate act — it creates a council — and must be stated, not defaulted into
 * by omitting a field.
 */
export const createOrganisationSchema = z.object({
  name: displayName,
  level: organisationLevelSchema,
  parentId: uuid.nullable(),
  /**
   * PRD §23.2 — for a council, the issuing council's state, which is what the
   * membership card prints. Distinct from a member's state of origin and never
   * to be conflated with it. Meaningless below council level.
   */
  stateName: z.string().trim().min(1).max(80).optional(),
});

export type CreateOrganisationInput = z.infer<typeof createOrganisationSchema>;

/**
 * Renaming, and nothing else.
 *
 * Level and parent are absent by design. Changing a node's level would
 * invalidate the placement of everything beneath it, and changing its parent is
 * a move — which requires permission at both ends and a path rewrite, so it has
 * its own route rather than hiding inside a general update.
 */
export const updateOrganisationSchema = z
  .object({
    name: displayName.optional(),
    stateName: z.string().trim().min(1).max(80).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be supplied.',
  });

export type UpdateOrganisationInput = z.infer<typeof updateOrganisationSchema>;

/** Moving a node, and with it every descendant. */
export const moveOrganisationSchema = z.object({
  parentId: uuid.nullable(),
  /**
   * Domain rule 6 — a move relocates every member and vehicle beneath the node
   * and is not self-explanatory after the fact. Required, not optional.
   */
  reason: z
    .string()
    .trim()
    .min(4, 'A reason is required for a move.')
    .max(500),
});

export type MoveOrganisationInput = z.infer<typeof moveOrganisationSchema>;

export const setOrganisationActiveSchema = z.object({
  isActive: z.boolean(),
  reason: z.string().trim().min(4).max(500),
});

export type SetOrganisationActiveInput = z.infer<
  typeof setOrganisationActiveSchema
>;

/** A node as returned to the dashboard. Never includes the raw path. */
export interface OrganisationNode {
  id: string;
  name: string;
  level: (typeof ORGANISATION_LEVELS)[number];
  parentId: string | null;
  stateName: string | null;
  isActive: boolean;
  depth: number;
  childCount: number;
}

export interface OrganisationTreeNode extends OrganisationNode {
  children: OrganisationTreeNode[];
}

// --- Master data -----------------------------------------------------------

/**
 * Creating a master-data entry.
 *
 * The code is set once here and never accepted by the update schema. Vehicle
 * categories are referenced by 2,841 legacy rows; changing a code is a data
 * migration wearing the clothes of an edit.
 */
export const createMasterDataSchema = z.object({
  code: masterDataCode,
  label: displayName,
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export type CreateMasterDataInput = z.infer<typeof createMasterDataSchema>;

export const updateMasterDataSchema = z
  .object({
    label: displayName.optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be supplied.',
  });

export type UpdateMasterDataInput = z.infer<typeof updateMasterDataSchema>;

export const createLgaSchema = z.object({
  code: masterDataCode,
  name: displayName,
  stateName: z.string().trim().min(1).max(80),
});

export type CreateLgaInput = z.infer<typeof createLgaSchema>;

export const updateLgaSchema = z
  .object({
    name: displayName.optional(),
    stateName: z.string().trim().min(1).max(80).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be supplied.',
  });

export type UpdateLgaInput = z.infer<typeof updateLgaSchema>;

/** A vehicle category or designation as returned to the dashboard. */
export interface MasterDataEntry {
  id: string;
  code: string;
  label: string;
  isActive: boolean;
  sortOrder: number;
}

/** A local government area as returned to the dashboard. */
export interface LgaEntry {
  id: string;
  code: string;
  name: string;
  stateName: string;
  isActive: boolean;
}

/** The master-data collections this item administers. */
export const MASTER_DATA_COLLECTIONS = [
  'vehicle-categories',
  'designations',
  'lgas',
] as const;

export type MasterDataCollection = (typeof MASTER_DATA_COLLECTIONS)[number];
