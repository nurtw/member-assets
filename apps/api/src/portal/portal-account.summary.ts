import type { PortalAccountSummary } from '@nurtw/contracts';
import type { Prisma } from '@prisma/client';

/**
 * A portal account, as selected for a response. `passwordHash` is not here
 * and must never be: an explicit select is what keeps it out of every
 * response (item 29).
 */
export const PORTAL_ACCOUNT_SELECT = {
  id: true,
  email: true,
  fullName: true,
  isActive: true,
  mustChangePassword: true,
  signInLockedUntil: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

export type PortalAccountRow = Prisma.PortalAccountGetPayload<{
  select: typeof PORTAL_ACCOUNT_SELECT;
}>;

export function toPortalAccountSummary(
  row: PortalAccountRow,
  now: Date,
): PortalAccountSummary {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    isActive: row.isActive,
    mustChangePassword: row.mustChangePassword,
    locked: row.signInLockedUntil !== null && row.signInLockedUntil > now,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
