/**
 * Organisational scope containment.
 *
 * ARCHITECTURE.md Decision 9.4 — every permission assignment carries a scope: a
 * node of the hierarchy, or the root for Union-wide authority. Authorisation
 * asks two questions, not one: does the actor hold the permission, and does the
 * subject record fall within the actor's scope for it.
 *
 * Without the second question the eleven roles of PRD §16 collapse into a single
 * privilege level the moment a second branch exists — a branch administrator in
 * Awka South could suspend a member in Onitsha North.
 *
 * Containment is a prefix test over the materialised path stored on each
 * organisation row (see the `Organisation.path` column, item 02). Holding a
 * permission at a branch means holding it for that branch and everything beneath
 * it, and for nothing above it.
 */

/**
 * A materialised ancestry path, e.g. `/council-id/zone-id/branch-id/`.
 *
 * Leading and trailing separators are required. They are what make the prefix
 * test safe: without the trailing separator, `/a/branch-1/` would appear to
 * contain `/a/branch-10/`, silently widening a scope to a sibling.
 */
export type OrganisationPath = string;

export const PATH_SEPARATOR = '/';

export class InvalidOrganisationPathError extends Error {
  override readonly name = 'InvalidOrganisationPathError';
}

/** Builds a path from an ordered list of ancestor ids, outermost first. */
export function buildOrganisationPath(
  ancestorIdsOutermostFirst: readonly string[],
): OrganisationPath {
  for (const id of ancestorIdsOutermostFirst) {
    if (id.length === 0 || id.includes(PATH_SEPARATOR)) {
      throw new InvalidOrganisationPathError(
        `Organisation id ${JSON.stringify(id)} is empty or contains the path separator.`,
      );
    }
  }

  if (ancestorIdsOutermostFirst.length === 0) {
    return PATH_SEPARATOR;
  }

  return `${PATH_SEPARATOR}${ancestorIdsOutermostFirst.join(PATH_SEPARATOR)}${PATH_SEPARATOR}`;
}

function assertWellFormed(path: OrganisationPath): void {
  if (!path.startsWith(PATH_SEPARATOR) || !path.endsWith(PATH_SEPARATOR)) {
    throw new InvalidOrganisationPathError(
      `Path ${JSON.stringify(path)} must begin and end with ${PATH_SEPARATOR}. ` +
        'The trailing separator is what prevents a scope leaking to a sibling ' +
        'whose id shares a prefix.',
    );
  }
}

/**
 * True when `subjectPath` is the scope itself or lies beneath it.
 *
 * The root scope (`/`) contains everything, which is how Union-wide authority is
 * expressed without a special case in the caller.
 */
export function scopeContains(
  scopePath: OrganisationPath,
  subjectPath: OrganisationPath,
): boolean {
  assertWellFormed(scopePath);
  assertWellFormed(subjectPath);

  return subjectPath.startsWith(scopePath);
}

/** True when any of the actor's scopes contains the subject. */
export function anyScopeContains(
  scopePaths: readonly OrganisationPath[],
  subjectPath: OrganisationPath,
): boolean {
  return scopePaths.some((scope) => scopeContains(scope, subjectPath));
}
