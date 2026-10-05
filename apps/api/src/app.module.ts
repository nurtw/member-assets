import { Module } from '@nestjs/common';

import { AggregateModule } from './aggregate/aggregate.module.js';
import { ApiClientModule } from './api-client/api-client.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CardModule } from './card/card.module.js';
import { PublicRateLimitModule } from './common/public-rate-limit.service.js';
import { DisclosureModule } from './disclosure/disclosure.module.js';
import { DocsModule } from './docs/docs.module.js';
import { HealthModule } from './health/health.module.js';
import { MasterDataModule } from './master-data/master-data.module.js';
import { MediaModule } from './media/media.module.js';
import { MembershipModule } from './membership/membership.module.js';
import { OrganisationModule } from './organisation/organisation.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PortalModule } from './portal/portal.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RateLimitModule } from './rate-limit/rate-limit.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { StickerModule } from './sticker/sticker.module.js';
import { UsersModule } from './users/users.module.js';
import { VehicleModule } from './vehicle/vehicle.module.js';
import { VehicleLetterModule } from './vehicle-letter/vehicle-letter.module.js';
import { VerificationModule } from './verification/verification.module.js';

/**
 * Root module.
 *
 * ARCHITECTURE.md §4 — the fifteen modules of PRD §19 are each realised as a
 * discrete NestJS module registered here. Modules communicate only through
 * injected services with declared interfaces; none reaches into another module's
 * Prisma models directly (Decision 4.1).
 *
 * Modules are added as their roadmap items land.
 */
@Module({
  imports: [
    PrismaModule,
    SettingsModule,
    PublicRateLimitModule,
    AuditModule,
    AuthModule,
    DocsModule,
    HealthModule,
    OrganisationModule,
    MasterDataModule,
    MembershipModule,
    CardModule,
    MediaModule,
    VehicleModule,
    PaymentsModule,
    StickerModule,
    VehicleLetterModule,
    VerificationModule,
    DisclosureModule,
    ApiClientModule,
    RateLimitModule,
    AggregateModule,
    UsersModule,
    PortalModule,
  ],
})
export class AppModule {}
