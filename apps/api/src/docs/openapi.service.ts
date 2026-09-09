import { Injectable, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';

import {
  buildOpenApiDocument,
  discoverRoutes,
  type DiscoveredRoute,
} from './openapi.builder.js';

export const API_GLOBAL_PREFIX = 'api/v1';

/**
 * Produces the API reference from the running application.
 *
 * Built once at start-up: the routing table cannot change afterwards, and
 * rebuilding it per request would reflect metadata over the container on every
 * documentation fetch for no benefit.
 */
@Injectable()
export class OpenApiService implements OnModuleInit {
  private routes: DiscoveredRoute[] = [];
  private document: Record<string, unknown> = {};

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
  ) {}

  onModuleInit(): void {
    this.routes = discoverRoutes(
      this.discovery,
      this.scanner,
      API_GLOBAL_PREFIX,
    );
    this.document = buildOpenApiDocument(this.routes, {
      version: process.env.npm_package_version ?? '0.1.0',
      serverUrl:
        process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3001}`,
    });
  }

  getDocument(): Record<string, unknown> {
    return this.document;
  }

  /** Every route as the container exposes it — used by the drift test. */
  getRoutes(): readonly DiscoveredRoute[] {
    return this.routes;
  }
}
