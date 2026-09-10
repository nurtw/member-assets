import { Global, Module } from '@nestjs/common';

import { SettingsService } from './settings.service.js';

/**
 * Runtime configuration.
 *
 * Global, because settings are consulted from anywhere and a control that is
 * awkward to reach is a control somebody works around. Nothing here is
 * request-scoped or stateful, so there is no coupling beyond the read.
 */
@Global()
@Module({
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
