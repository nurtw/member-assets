import { Module } from '@nestjs/common';

import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';
import {
  CloudinaryStorage,
  LocalFilesystemStorage,
  StoragePort,
} from './storage.service.js';

/**
 * PRD §19 module — uploaded media.
 *
 * `StoragePort` is bound here and nowhere else (Decision 12.1), so which
 * adapter backs it is a one-line decision that touches no caller. Cloudinary
 * when `CLOUDINARY_URL` is present in the environment — set it and nothing
 * else changes — the local filesystem otherwise, for a machine with no
 * Cloudinary account.
 */
@Module({
  controllers: [MediaController],
  providers: [
    MediaService,
    {
      provide: StoragePort,
      useClass: process.env.CLOUDINARY_URL
        ? CloudinaryStorage
        : LocalFilesystemStorage,
    },
  ],
  exports: [MediaService],
})
export class MediaModule {}
