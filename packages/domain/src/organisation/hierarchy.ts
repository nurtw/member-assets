/**
 * Organisational hierarchy rules.
 *
 * PRD §6 and determination §23.1 — Council → Zone → Branch → Unit → Member. Four
 * levels beneath the council, every one of them present in the model even where
 * the Union does not presently populate it (Requirement 6.1).
 *
 * These are pure functions over levels and paths, deliberately holding no
 * database access (ARCHITECTURE.md Decision 3.2). The path arithmetic below is
 * the same denormalisation the permission check reads, so an error here does not
 * merely misplace a node — it silently moves a scope boundary.
 *
 * The *Unit* / *Unity Body* distinction is presentational only (§23.3): one
 * entity, named `UNIT` in code and administration, printed as "Unity Body" on
 * the membership card.
 */

import {
  InvalidOrganisationPathError,
  PATH_SEPARATOR,
  scopeContains,
  type OrganisationPath,
} from '../permissions/organisation-scope.js';

/**
 * The levels, outermost first. Order is meaningful: an index in this array is
 * the node's depth beneath the root.
 */
export const ORGANISATION_LEVELS = [
  'COUNCIL',
  'ZONE',
  'BRANCH',
  'UNIT',
] as const;

export type OrganisationLevel = (typeof ORGANISATION_LEVELS)[number];

export class InvalidHierarchyError extends Error {
  override readonly name = 'InvalidHierarchyError';
}

export function isOrganisationLevel(value: string): value is OrganisationLevel {
  return (ORGANISATION_LEVELS as readonly string[]).includes(value);
}

/** Depth beneath the root; `COUNCIL` is 0. */
export function levelDepth(level: OrganisationLevel): number {
  return ORGANISATION_LEVELS.indexOf(level);
}

/** The level a node of this level may contain, or `null` at the leaf. */
export function childLevelOf(
  level: OrganisationLevel,
): OrganisationLevel | null {
  return ORGANISATION_LEVELS[levelDepth(level) + 1] ?? null;
}

/** The level a node of this level must sit beneath, or `null` at the root. */
export function parentLevelOf(
  level: OrganisationLevel,
): OrganisationLevel | null {
  const depth = levelDepth(level);
  return depth === 0 ? null : (ORGANISATION_LEVELS[depth - 1] as OrganisationLevel);
}

/**
 * Whether `childLevel` may sit directly beneath `parentLevel`.
 *
 * The test is *exact*, not "somewhere above". Permitting a unit directly beneath
 * a council would make the level field decorative: two records both described as
 * being in a unit would sit at different depths, and no scope query could say
 * which levels it had skipped.
 *
 * `parentLevel` of `null` means the root, where only a council may sit.
 */
export function canContain(
  parentLevel: OrganisationLevel | null,
  childLevel: OrganisationLevel,
): boolean {
  return parentLevelOf(childLevel) === parentLevel;
}

export function assertValidPlacement(
  parentLevel: OrganisationLevel | null,
  childLevel: OrganisationLevel,
): void {
  if (canContain(parentLevel, childLevel)) {
    return;
  }

  const required = parentLevelOf(childLevel);
  throw new InvalidHierarchyError(
    required === null
      ? `A ${childLevel} is a root node and cannot be placed beneath a ${String(parentLevel)}.`
      : `A ${childLevel} must sit directly beneath a ${required}, not beneath ` +
        `${parentLevel === null ? 'the root' : `a ${parentLevel}`}.`,
  );
}

/**
 * The path a node acquires when placed beneath `parentPath`.
 *
 * `parentPath` of `null` places the node at the root, giving `/<id>/`.
 */
export function childPath(
  parentPath: OrganisationPath | null,
  childId: string,
): OrganisationPath {
  if (childId.length === 0 || childId.includes(PATH_SEPARATOR)) {
    throw new InvalidOrganisationPathError(
      `Organisation id ${JSON.stringify(childId)} is empty or contains the path separator.`,
    );
  }

  const base = parentPath ?? PATH_SEPARATOR;
  assertWellFormed(base);
  return `${base}${childId}${PATH_SEPARATOR}`;
}

/** The id of the node a path names — its last segment. */
export function idFromPath(path: OrganisationPath): string {
  assertWellFormed(path);
  const segments = path.split(PATH_SEPARATOR).filter((s) => s.length > 0);
  const last = segments[segments.length - 1];
  if (last === undefined) {
    throw new InvalidOrganisationPathError(
      'The root path names no organisation.',
    );
  }
  return last;
}

/** The path of a node's parent, or `null` when the node is at the root. */
export function parentPathOf(
  path: OrganisationPath,
): OrganisationPath | null {
  assertWellFormed(path);
  const segments = path.split(PATH_SEPARATOR).filter((s) => s.length > 0);
  if (segments.length <= 1) {
    return null;
  }
  return `${PATH_SEPARATOR}${segments.slice(0, -1).join(PATH_SEPARATOR)}${PATH_SEPARATOR}`;
}

/**
 * Whether a node may be moved beneath a new parent.
 *
 * Refuses a move into the node's own subtree, including onto itself. Such a move
 * would detach the subtree from the tree entirely: every node in it would carry
 * a path whose prefix is a node inside the same subtree, reachable from no root,
 * and the rewrite below would not terminate against any ancestor.
 */
export function isMoveAcyclic(
  nodePath: OrganisationPath,
  destinationParentPath: OrganisationPath | null,
): boolean {
  if (destinationParentPath === null) {
    return true;
  }
  return !scopeContains(nodePath, destinationParentPath);
}

export function assertMoveIsAcyclic(
  nodePath: OrganisationPath,
  destinationParentPath: OrganisationPath | null,
): void {
  if (!isMoveAcyclic(nodePath, destinationParentPath)) {
    throw new InvalidHierarchyError(
      'An organisation cannot be moved beneath itself or one of its own descendants.',
    );
  }
}

/**
 * Rewrites a descendant's path after its ancestor has moved.
 *
 * Swaps the ancestor's old prefix for its new one, leaving the portion below the
 * ancestor untouched — the subtree keeps its internal shape, which is why a move
 * needs no per-node reasoning.
 *
 * Every descendant must be rewritten in the same transaction as the moved node.
 * A partial rewrite leaves descendants claiming ancestry that no longer holds,
 * and `scopeContains` would then answer authorisation questions from stale
 * ancestry — granting access through a branch the record has left, and denying
 * it through the branch it has joined.
 */
export function rewriteDescendantPath(
  oldAncestorPath: OrganisationPath,
  newAncestorPath: OrganisationPath,
  descendantPath: OrganisationPath,
): OrganisationPath {
  assertWellFormed(oldAncestorPath);
  assertWellFormed(newAncestorPath);
  assertWellFormed(descendantPath);

  if (!descendantPath.startsWith(oldAncestorPath)) {
    throw new InvalidHierarchyError(
      `Path ${JSON.stringify(descendantPath)} does not lie beneath ` +
        `${JSON.stringify(oldAncestorPath)} and must not be rewritten by this move.`,
    );
  }

  return `${newAncestorPath}${descendantPath.slice(oldAncestorPath.length)}`;
}

function assertWellFormed(path: OrganisationPath): void {
  if (!path.startsWith(PATH_SEPARATOR) || !path.endsWith(PATH_SEPARATOR)) {
    throw new InvalidOrganisationPathError(
      `Path ${JSON.stringify(path)} must begin and end with ${PATH_SEPARATOR}.`,
    );
  }
}

/**
 * Reduces a set of scopes to those not already covered by another.
 *
 * Used when answering "which parts of the hierarchy may this user read": a user
 * holding `organisation.read` at both a council and one of its branches should
 * receive the council's subtree once, not the branch's rows twice.
 */
export function outermostScopes(
  scopePaths: readonly OrganisationPath[],
): OrganisationPath[] {
  const unique = [...new Set(scopePaths)];
  return unique.filter(
    (candidate) =>
      !unique.some(
        (other) => other !== candidate && scopeContains(other, candidate),
      ),
  );
}
