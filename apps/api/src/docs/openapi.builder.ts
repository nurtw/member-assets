import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import type { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper.js';
import { z } from 'zod';

import {
  PERMISSION_METADATA_KEY,
  PUBLIC_METADATA_KEY,
} from '../auth/require-permission.decorator.js';
import {
  DOCUMENTED_METADATA_KEY,
  type RouteDocumentation,
} from './documented.decorator.js';

/** A route as the running application actually exposes it. */
export interface DiscoveredRoute {
  method: string;
  path: string;
  controller: string;
  handler: string;
  isPublic: boolean;
  permission: string | null;
  documentation: RouteDocumentation | null;
}

const METHOD_NAMES: Record<number, string> = {
  [RequestMethod.GET]: 'get',
  [RequestMethod.POST]: 'post',
  [RequestMethod.PUT]: 'put',
  [RequestMethod.DELETE]: 'delete',
  [RequestMethod.PATCH]: 'patch',
  [RequestMethod.OPTIONS]: 'options',
  [RequestMethod.HEAD]: 'head',
  [RequestMethod.ALL]: 'get',
};

/**
 * Enumerates every route the application exposes, with its guard metadata.
 *
 * Read from the dependency-injection container rather than from a list someone
 * maintains, so this is the routing table as it is, not as it was intended. The
 * permission and public flags come from the same metadata keys the guard reads,
 * which makes the generated specification an accurate statement of what each
 * route requires — and makes an undeclared route visible rather than merely
 * denied.
 */
export function discoverRoutes(
  discovery: DiscoveryService,
  scanner: MetadataScanner,
  globalPrefix: string,
): DiscoveredRoute[] {
  const routes: DiscoveredRoute[] = [];

  for (const wrapper of discovery.getControllers()) {
    const { instance, metatype } = wrapper as InstanceWrapper<object>;
    if (!instance || !metatype) {
      continue;
    }

    const controllerPath =
      (Reflect.getMetadata(PATH_METADATA, metatype) as string | undefined) ?? '';

    const prototype = Object.getPrototypeOf(instance) as object;

    for (const methodName of scanner.getAllMethodNames(prototype)) {
      const handler = (prototype as Record<string, unknown>)[methodName];
      if (typeof handler !== 'function') {
        continue;
      }

      const verb = Reflect.getMetadata(METHOD_METADATA, handler) as
        | number
        | undefined;
      if (verb === undefined) {
        continue;
      }

      const handlerPath =
        (Reflect.getMetadata(PATH_METADATA, handler) as string | undefined) ??
        '';

      routes.push({
        method: METHOD_NAMES[verb] ?? 'get',
        path: joinPath(globalPrefix, controllerPath, handlerPath),
        controller: metatype.name,
        handler: methodName,
        isPublic:
          Reflect.getMetadata(PUBLIC_METADATA_KEY, handler) === true ||
          Reflect.getMetadata(PUBLIC_METADATA_KEY, metatype) === true,
        permission:
          (Reflect.getMetadata(PERMISSION_METADATA_KEY, handler) as
            | string
            | undefined) ??
          (Reflect.getMetadata(PERMISSION_METADATA_KEY, metatype) as
            | string
            | undefined) ??
          null,
        documentation:
          (Reflect.getMetadata(DOCUMENTED_METADATA_KEY, handler) as
            | RouteDocumentation
            | undefined) ?? null,
      });
    }
  }

  return routes.sort(
    (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
  );
}

/** Joins route segments into a single `/`-prefixed path with no doubled slashes. */
function joinPath(...segments: string[]): string {
  const joined = segments
    .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
    .filter((segment) => segment.length > 0)
    .join('/');
  return `/${joined}`;
}

/** Rewrites Express `:param` placeholders into OpenAPI `{param}` form. */
function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function pathParameters(path: string) {
  return [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => ({
    name: match[1] as string,
    in: 'path' as const,
    required: true,
    schema: { type: 'string' as const, format: 'uuid' },
  }));
}

/**
 * The shared error envelope, described once and referenced from every operation.
 *
 * Every failure in this API answers in this shape, including a request that
 * matched no route at all. That is a deliberate property rather than a
 * convenience: a caller must not be able to distinguish "no such route" from "no
 * such record" from "not permitted", because those differences describe the
 * record set (PRD Requirement 14.3).
 */
const ERROR_SCHEMA = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message', 'requestId'],
      properties: {
        code: { type: 'string' },
        message: {
          type: 'string',
          description:
            'Deliberately uninformative. Correlate the requestId with the server log for detail.',
        },
        requestId: { type: 'string' },
        details: {
          type: 'array',
          description:
            'Field-level validation failures. Present only on a rejected request body, and describing only the request the caller sent.',
          items: {
            type: 'object',
            required: ['field', 'message'],
            properties: {
              field: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
  },
} as const;

export interface OpenApiOptions {
  version: string;
  serverUrl: string;
}

/**
 * Builds an OpenAPI 3.1 document from the discovered routes.
 *
 * Request bodies come from the same zod schemas the API validates against, via
 * zod's own JSON Schema conversion. Documentation and validation therefore
 * cannot disagree: there is one definition, and the specification is a rendering
 * of it.
 */
export function buildOpenApiDocument(
  routes: readonly DiscoveredRoute[],
  options: OpenApiOptions,
): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of routes) {
    const documentation = route.documentation;
    if (!documentation) {
      continue;
    }

    const openApiPath = toOpenApiPath(route.path);
    paths[openApiPath] ??= {};

    const responses: Record<string, unknown> = {
      '200': { description: 'Successful response.' },
    };
    if (route.method === 'post') {
      responses['201'] = { description: 'Created.' };
      delete responses['200'];
    }
    for (const [status, description] of Object.entries(
      documentation.responses ?? {},
    )) {
      responses[status] = {
        description,
        content: { 'application/json': { schema: ERROR_SCHEMA } },
      };
    }
    if (!route.isPublic) {
      responses['401'] ??= {
        description: 'No valid session cookie was presented.',
        content: { 'application/json': { schema: ERROR_SCHEMA } },
      };
      responses['403'] ??= {
        description: `The session does not hold ${route.permission ?? 'the required permission'} in the relevant scope.`,
        content: { 'application/json': { schema: ERROR_SCHEMA } },
      };
    }

    const parameters = [
      ...pathParameters(route.path),
      ...(documentation.query ?? []).map((parameter) => ({
        name: parameter.name,
        in: 'query' as const,
        required: parameter.required ?? false,
        description: parameter.description,
        schema: { type: 'string' as const },
      })),
    ];

    paths[openApiPath]![route.method] = {
      summary: documentation.summary,
      description: buildDescription(route, documentation),
      operationId: `${route.controller}_${route.handler}`,
      tags: [route.controller.replace(/Controller$/, '')],
      ...(parameters.length > 0 ? { parameters } : {}),
      ...(documentation.body
        ? {
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: z.toJSONSchema(documentation.body, {
                    io: 'input',
                    unrepresentable: 'any',
                  }),
                },
              },
            },
          }
        : {}),
      responses,
      ...(route.isPublic ? { security: [] } : {}),
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'NURTW Membership and Vehicle Verification System',
      version: options.version,
      description:
        'Internal administration API for the National Union of Road Transport Workers, ' +
        'Anambra State Council.\n\n' +
        'A verification enquiry answered by this system confirms only that a matching ' +
        'NURTW record exists under the requested criteria. It is not evidence of ' +
        'ownership, roadworthiness, licensing, or insurance, and no response should be ' +
        'presented as such.\n\n' +
        'This document is generated from the running application: the route list is read ' +
        'from the dependency-injection container and request bodies from the same schemas ' +
        'the API validates against. It cannot describe a route that does not exist.',
    },
    servers: [{ url: options.serverUrl }],
    components: {
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'nurtw_session',
          description:
            'Opaque session token issued by POST /auth/login and set as an httpOnly cookie. ' +
            'Revocation takes effect on the next request.',
        },
      },
      schemas: { Error: ERROR_SCHEMA },
    },
    security: [{ sessionCookie: [] }],
    paths,
  };
}

function buildDescription(
  route: DiscoveredRoute,
  documentation: RouteDocumentation,
): string {
  const parts = [documentation.description?.trim()].filter(
    (part): part is string => Boolean(part),
  );

  parts.push(
    route.isPublic
      ? '**Authentication:** none. This route is deliberately public.'
      : `**Permission required:** \`${route.permission ?? 'unknown'}\`.`,
  );

  return parts.join('\n\n');
}
