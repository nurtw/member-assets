import type { UserScopedPermission } from "@nurtw/contracts";

/**
 * Giving an officer several permissions at once (item 56).
 *
 * The API refuses the whole act if any one is already in place there, so the
 * screen sends only what is not: a permission granted in this part of the
 * Union already is left out of a grant, and one revoked there already is left
 * out of a revocation.
 */
export function notInPlace(
  chosen: readonly string[],
  inPlace: readonly UserScopedPermission[],
  scopeId: string,
): string[] {
  return chosen.filter(
    (code) =>
      !inPlace.some(
        (entry) =>
          entry.permission === code && entry.organisation.id === scopeId,
      ),
  );
}

/** What is already in place for a permission there, said beside it in the list. */
export function placeNote(
  code: string,
  grants: readonly UserScopedPermission[],
  revocations: readonly UserScopedPermission[],
  scopeId: string,
): string | null {
  const granted = notInPlace([code], grants, scopeId).length === 0;
  const revoked = notInPlace([code], revocations, scopeId).length === 0;
  if (granted && revoked) return "granted and revoked there";
  if (granted) return "granted there";
  if (revoked) return "revoked there";
  return null;
}

/** Whether a permission matches what is typed in the list's filter. */
export function matchesPermission(
  entry: { code: string; description: string },
  query: string,
): boolean {
  const wanted = query.trim().toLowerCase();
  return (
    wanted.length === 0 ||
    entry.code.toLowerCase().includes(wanted) ||
    entry.description.toLowerCase().includes(wanted)
  );
}
