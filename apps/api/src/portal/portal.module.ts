import { Module } from '@nestjs/common';

import { ApiClientModule } from '../api-client/api-client.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { RateLimitModule } from '../rate-limit/rate-limit.module.js';
import { InvitationService } from './invitation.service.js';
import { InvitationsController } from './invitations.controller.js';
import { PortalSessionModule } from './portal-session.service.js';
import {
  ApiClientUsageController,
  PortalAccountsController,
  PortalController,
} from './portal.controller.js';
import { PortalService } from './portal.service.js';

/**
 * The organisation portal (PRD §23.23, revision 1.9; EXT-20 — item 29).
 *
 * It reads and acts through `ApiClientModule`'s services, so an organisation
 * acting on its own tokens goes down exactly the path an officer does, with
 * the same locks, checks, and audit entries.
 */
@Module({
  imports: [ApiClientModule, AuditModule, RateLimitModule, PortalSessionModule],
  controllers: [
    PortalController,
    PortalAccountsController,
    ApiClientUsageController,
    InvitationsController,
  ],
  providers: [PortalService, InvitationService],
})
export class PortalModule {}
