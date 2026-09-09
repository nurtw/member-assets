import { Module } from '@nestjs/common';

import { MasterDataController } from './master-data.controller.js';
import { MasterDataService } from './master-data.service.js';

/**
 * PRD §19 module — master data.
 *
 * No `AuthModule` import: these collections are Union-wide and carry no
 * organisational scope, so the global guard's check is the whole check. See the
 * note on `MasterDataService`.
 */
@Module({
  controllers: [MasterDataController],
  providers: [MasterDataService],
  exports: [MasterDataService],
})
export class MasterDataModule {}
