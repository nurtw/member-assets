import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { DocsController } from './docs.controller.js';
import { OpenApiService } from './openapi.service.js';

/**
 * API reference generation.
 *
 * `DiscoveryModule` provides the container introspection the builder needs to
 * read the real routing table.
 */
@Module({
  imports: [DiscoveryModule],
  controllers: [DocsController],
  providers: [OpenApiService],
  exports: [OpenApiService],
})
export class DocsModule {}
