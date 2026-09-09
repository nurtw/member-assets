import { SetMetadata } from '@nestjs/common';

export const PERMISSION_METADATA_KEY = 'nurtw:required-permission';
export const PUBLIC_METADATA_KEY = 'nurtw:public-route';

/**
 * Declares the permission a route requires.
 *
 * ARCHITECTURE.md Decision 9.9 — authorisation is evaluated by guards before a
 * controller executes. No authorisation decision is taken inside business logic,
 * where it cannot be enumerated, tested exhaustively, or audited.
 *
 * Decision 9.2 — this names a *permission*, never a role. `vehicle.declare`, not
 * "Vehicle-Record Officer".
 */
export const RequirePermission = (permission: string) =>
  SetMetadata(PERMISSION_METADATA_KEY, permission);

/**
 * Marks a route as reachable without authentication.
 *
 * Deliberately explicit. The guard denies anything not annotated, so a new route
 * is closed until someone states otherwise — the failure mode of forgetting is a
 * 403, not an open door.
 *
 * Use sparingly: health, login, and the QR verification page of PRD §23.13.
 */
export const Public = () => SetMetadata(PUBLIC_METADATA_KEY, true);
