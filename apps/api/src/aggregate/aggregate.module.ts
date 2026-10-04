import { Module } from '@nestjs/common';

import { ApiClientModule } from '../api-client/api-client.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { RateLimitModule } from '../rate-limit/rate-limit.module.js';
import {
  AggregateController,
  OrganisationMetadataController,
} from './aggregate.controller.js';
import { AggregateService } from './aggregate.service.js';

/**
 * PRD §19 module — aggregate (ARCHITECTURE.md §4 — item 14). Vehicle totals
 * and the metadata needed to ask for them, for outside organisations.
 *
 * `ApiClientModule` and `RateLimitModule` are imported for the external
 * request log and the abuse detection it feeds. It holds no write path of
 * its own beyond the audit event.
 */
@Module({
  imports: [AuditModule, ApiClientModule, RateLimitModule],
  controllers: [AggregateController, OrganisationMetadataController],
  providers: [AggregateService],
})
export class AggregateModule {}
