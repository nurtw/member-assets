import { Module } from '@nestjs/common';

import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';
import { LocalFilesystemStorage, StoragePort } from './storage.service.js';

/**
 * PRD §19 module — uploaded media.
 *
 * `StoragePort` is bound to the filesystem adapter here and nowhere else, so
 * moving to object storage for production is a one-line change in this module
 * and touches no caller (Decision 12.1).
 */
@Module({
  controllers: [MediaController],
  providers: [
    MediaService,
    { provide: StoragePort, useClass: LocalFilesystemStorage },
  ],
  exports: [MediaService],
})
export class MediaModule {}
