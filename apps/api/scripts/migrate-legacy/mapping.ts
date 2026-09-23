/**
 * Pure mapping logic for the legacy migration (item 09, PRD §25).
 *
 * Kept free of Prisma and file I/O so it can be unit tested directly —
 * everything here is "given this legacy value, what do we write", not "go
 * fetch or write it".
 */

import type { DeclarationStatus, MemberStatus } from '@prisma/client';

/**
 * The legacy export's boolean-ish columns (`status`, `blacklisted`) are
 * free text from a system we do not control. Accept the forms actually seen
 * across CSV exports rather than assume one; anything else is treated as
 * absent, never guessed.
 */
export function parseLegacyBoolean(value: string | undefined | null): boolean {
  if (!value) {
    return false;
  }
  return ['true', 't', '1', 'yes'].includes(value.trim().toLowerCase());
}

/**
 * `asin_number` is recorded as an empty string in place of null across the
 * export (CLAUDE.md's catalogued defect). The same pattern shows up on other
 * free-text legacy columns, so every field read from a CSV row goes through
 * this rather than a bare `|| null`, which a literal `"0"` or `"false"`
 * would defeat.
 */
export function blankToNull(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

/**
 * ARCHITECTURE.md Decision 6.5 (revision 1.2) — every migrated vehicle is
 * `ON_RECORD`, full stop. There is no `ACTIVE`/`SUSPENDED` distinction to
 * carry forward at import time: a migrated vehicle is never declared, so
 * "was it active in the old system" is not yet a fact this System has an
 * opinion on. That question only starts to matter once a vehicle is
 * actually declared — a future, deliberate `vehicle.declare` act, not this
 * script's.
 *
 * The legacy status is still surfaced, not discarded: the caller writes it
 * into `Vehicle.notes` so QUESTIONS.md MIG-06 (what an inactive or
 * blacklisted legacy record should mean going forward) has something to
 * act on later without a re-import. `flagged` marks a row worth surfacing
 * in the reconciliation report — blacklisted, non-`ACTIVE`, or an
 * unrecognised legacy value, the same set that would have been suspicious
 * under the pre-1.2 mapping this replaces.
 */
export function mapDeclarationStatus(
  legacyStatus: string | undefined | null,
  blacklisted: boolean,
): { status: DeclarationStatus; legacyStatusNote: string; flagged: boolean } {
  const normalised = legacyStatus?.trim().toUpperCase();
  const legacyStatusNote = `Legacy status: ${normalised || 'UNKNOWN'}${blacklisted ? ' (blacklisted)' : ''}.`;

  if (blacklisted) {
    return { status: 'ON_RECORD', legacyStatusNote, flagged: true };
  }
  if (normalised === 'ACTIVE') {
    return { status: 'ON_RECORD', legacyStatusNote, flagged: false };
  }
  // INACTIVE, empty, or any unrecognised value — flagged for staff review,
  // same as before, but never encoded as a declaration state.
  return { status: 'ON_RECORD', legacyStatusNote, flagged: true };
}

/** Same reasoning as {@link mapDeclarationStatus}, applied to a member row. */
export function mapMemberStatus(
  legacyStatus: string | undefined | null,
  blacklisted: boolean,
): { status: MemberStatus; flagged: boolean } {
  if (blacklisted) {
    return { status: 'SUSPENDED', flagged: true };
  }
  const normalised = legacyStatus?.trim().toUpperCase();
  if (normalised === 'ACTIVE') {
    return { status: 'ACTIVE', flagged: false };
  }
  return { status: 'SUSPENDED', flagged: true };
}

/**
 * Splits the legacy export's single `name` field into the `firstName` and
 * `surname` our schema requires separately. This is a genuine approximation,
 * not a recovered fact — the legacy system never distinguished the two — and
 * every member migrated through it is flagged in the reconciliation report
 * for staff to correct once seen against the person's own record. First
 * token becomes the given name; the remainder becomes the surname, since
 * that reads correctly on a card for the common case and degrades to
 * duplicating a single-word name into both fields rather than leaving either
 * blank.
 */
export function splitLegacyName(fullName: string): {
  firstName: string;
  surname: string;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: '', surname: '' };
  }
  if (parts.length === 1) {
    return { firstName: parts[0]!, surname: parts[0]! };
  }
  return { firstName: parts[0]!, surname: parts.slice(1).join(' ') };
}

/**
 * Matches a legacy `lga_name` against the Union's real LGA/zone list by
 * exact name (case- and space-insensitive) — not a fuzzy or inferred match.
 * PRD §23.18 prohibits *inferring* an LGA that is missing; this only
 * recognises one the legacy system already recorded. Returns `null` for a
 * blank value or one that does not match any known LGA, both of which the
 * caller must place in the migration's "Unclassified" fallback branch and
 * list in the reconciliation report (Requirement 25.3).
 */
export function matchLgaByName<T extends { name: string }>(
  lgaName: string | undefined | null,
  knownLgas: readonly T[],
): T | null {
  const target = blankToNull(lgaName)
    ?.toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (!target) {
    return null;
  }
  return (
    knownLgas.find(
      (lga) => lga.name.toLowerCase().replace(/\s+/g, ' ').trim() === target,
    ) ?? null
  );
}
