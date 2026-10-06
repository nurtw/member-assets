/**
 * Rules for officer accounts and the access given to them (PRD §16, §17.1 —
 * item 28). Pure: no Nest, no Prisma.
 *
 * - **Which permissions need a second factor.** A session may exercise one of
 *   these only after proving a second factor (Requirement 17.1, the owner's
 *   direction of 4 October 2026).
 * - **Which permissions may never sit in a role.** `vehicle.declare` and the
 *   settlement account belong to the super administrator and to those it is
 *   expressly granted to (PRD §9.5, Requirement 27.12).
 * - **Nobody gives what they do not hold.** A role or a permission is given
 *   only by somebody who holds all of it in that scope.
 * - **What a password must be.**
 */

/**
 * The permissions that change who can do what, expose the Union's data to
 * outsiders, move its money, or create a declaration. Named as permissions,
 * never roles (Decision 9.2): a custom role holding one is privileged too.
 */
export const SECOND_FACTOR_PERMISSIONS: readonly string[] = [
  'user.manage',
  'role.manage',
  'permission.grant',
  'permission.revoke',
  'system_setting.manage',
  'rate_limit.manage',
  'security.monitor',
  'api_client.manage',
  'api_token.manage',
  'disclosure_profile.manage',
  'payment.manage_settlement',
  'vehicle.declare',
  'sticker.stock_intake',
];

export function needsSecondFactor(permission: string): boolean {
  return SECOND_FACTOR_PERMISSIONS.includes(permission);
}

/**
 * Permissions no role composed by the Union may hold. Each reaches a user
 * only through the super administrator's bundle or an express, audited grant
 * to a named person, so that the list of holders is one somebody decided.
 */
export const GRANT_ONLY_PERMISSIONS: readonly string[] = [
  'vehicle.declare',
  'payment.manage_settlement',
  // PRD Requirement 9A.8 (VEH-29) — whoever adds stickers to stock decides
  // which stickers count, because a legacy barcode proves nothing by itself.
  'sticker.stock_intake',
];

export function isGrantOnly(permission: string): boolean {
  return GRANT_ONLY_PERMISSIONS.includes(permission);
}

/**
 * The permissions the giver lacks, of those they are trying to give. Empty
 * means they may give them all. `held` is what the giver holds **in the scope
 * being given**, with revocations applied.
 */
export function escalations(
  held: Iterable<string>,
  giving: Iterable<string>,
): string[] {
  const has = new Set(held);
  return [...new Set(giving)].filter((permission) => !has.has(permission));
}

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 200;

/**
 * Why a password is refused, or an empty list. Length is the rule that
 * matters; the rest only keeps out what is no password at all. No character
 * classes are demanded: they push people to `Password1!` and add little.
 */
export function passwordProblems(
  password: string,
  account: { email: string; fullName: string },
): string[] {
  const problems: string[] = [];
  if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    problems.push(`Use at most ${MAX_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > 0 && new Set(password).size < 5) {
    problems.push('Use more than a few different characters.');
  }
  const lowered = password.toLowerCase();
  const local = account.email.split('@')[0]?.toLowerCase() ?? '';
  if (local.length >= 4 && lowered.includes(local)) {
    problems.push('Do not use your email address in it.');
  }
  for (const part of account.fullName.toLowerCase().split(/\s+/)) {
    if (part.length >= 4 && lowered.includes(part)) {
      problems.push('Do not use your name in it.');
      break;
    }
  }
  return problems;
}
