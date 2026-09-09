/**
 * Authentication request schemas.
 *
 * The login schema validates *shape* only. It deliberately imposes no minimum
 * password length and no character rules: those belong on the route that sets a
 * password, not on the one that checks it. Rejecting a short password at login
 * would tell a caller that no account could hold it, and would lock out any
 * account whose password predates a later policy change.
 */

import { z } from 'zod';

export const loginSchema = z.object({
  /**
   * Lower-cased here so the schema and `AuthService` agree on what an address
   * is. Addresses are stored lower-cased; comparing a mixed-case submission
   * against them fails to find an account that plainly exists.
   */
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'An email address is required.')
    .max(320)
    .pipe(z.email('A valid email address is required.')),
  password: z.string().min(1, 'A password is required.').max(1024),
});

export type LoginInput = z.infer<typeof loginSchema>;
