import { Module } from '@nestjs/common';

import { DisclosureProfileService } from './disclosure-profile.service.js';
import { DisclosureProfilesController } from './disclosure-profiles.controller.js';

/**
 * Disclosure profiles (ARCHITECTURE.md §4, Decision 5.2).
 *
 * The service is exported so the `api-client` module can check the profile an
 * organisation is being given, through a method rather than a query of its own
 * (Decision 4.2). The projection itself is `projectVerification` in
 * `@nurtw/domain`, and has no Nest wrapper.
 */
@Module({
  controllers: [DisclosureProfilesController],
  providers: [DisclosureProfileService],
  exports: [DisclosureProfileService],
})
export class DisclosureModule {}
