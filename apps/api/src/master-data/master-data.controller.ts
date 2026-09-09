import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  createLgaSchema,
  createMasterDataSchema,
  updateLgaSchema,
  updateMasterDataSchema,
  type CreateLgaInput,
  type CreateMasterDataInput,
  type UpdateLgaInput,
  type UpdateMasterDataInput,
} from '@nurtw/contracts';

import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import { Documented } from '../docs/documented.decorator.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import {
  MasterDataService,
  type CodedCollection,
} from './master-data.service.js';

const CODED_COLLECTIONS: readonly CodedCollection[] = [
  'vehicle-categories',
  'designations',
];

/**
 * Master-data administration (PRD §23.4).
 *
 * The route parameter is validated against a fixed list rather than passed to
 * the service as given. The service switches on it to choose a Prisma model, so
 * an unchecked value would be a caller-supplied model selector.
 */
@Controller('master-data')
export class MasterDataController {
  constructor(private readonly masterData: MasterDataService) {}

  @RequirePermission('master_data.read')
  @Get('lgas')
  @Documented({
    summary: 'List local government areas.',
    description:
      'Seeded with the twenty-one areas of Anambra State. The state is carried per row rather ' +
      'than assumed, so a second state council can be onboarded without a migration.',
    query: [
      {
        name: 'includeInactive',
        description: 'Set to "true" to include deactivated entries. Omitted, only active entries are returned.',
      },
    ],
  })
  async listLgas(@Query('includeInactive') includeInactive?: string) {
    return {
      lgas: await this.masterData.listLgas(includeInactive === 'true'),
    };
  }

  @RequirePermission('master_data.manage')
  @Post('lgas')
  @Documented({
    summary: 'Create a local government area.',
    body: createLgaSchema,
    responses: {
      409: 'That code is already in use. Reactivate the existing entry rather than creating a second.',
    },
  })
  async createLga(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createLgaSchema)) body: CreateLgaInput,
  ) {
    return {
      lga: await this.masterData.createLga(this.actor(request), body),
    };
  }

  @RequirePermission('master_data.manage')
  @Patch('lgas/:id')
  @Documented({
    summary: 'Amend or deactivate a local government area.',
    description:
      'The code is immutable and is not accepted here. Entries are deactivated, never deleted: ' +
      'member records reference them, and removing a row would orphan or block those records.',
    body: updateLgaSchema,
    responses: { 404: 'No such entry.' },
  })
  async updateLga(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateLgaSchema)) body: UpdateLgaInput,
  ) {
    return {
      lga: await this.masterData.updateLga(this.actor(request), id, body),
    };
  }

  @RequirePermission('master_data.read')
  @Get(':collection')
  @Documented({
    summary: 'List a master-data collection.',
    description:
      'Collections are `vehicle-categories` and `designations`. Designations are deliberately ' +
      'empty until the Union supplies them: the legacy export carries no designation list, and ' +
      'inventing one would present values with the appearance of Union authority (PRD §23.4).',
    query: [
      {
        name: 'includeInactive',
        description: 'Set to "true" to include deactivated entries.',
      },
    ],
    responses: { 400: 'Unknown collection.' },
  })
  async list(
    @Param('collection') collection: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return {
      entries: await this.masterData.listCoded(
        this.collection(collection),
        includeInactive === 'true',
      ),
    };
  }

  @RequirePermission('master_data.manage')
  @Post(':collection')
  @Documented({
    summary: 'Add an entry to a master-data collection.',
    description:
      'The code is set once here and is never editable afterwards. A code is a foreign key in ' +
      'all but name — it appears in the legacy import mapping and in operational queries — so ' +
      'changing it later would be a silent data migration.',
    body: createMasterDataSchema,
    responses: {
      400: 'Unknown collection, or the body failed validation.',
      409: 'That code is already in use.',
    },
  })
  async create(
    @Req() request: AuthenticatedRequest,
    @Param('collection') collection: string,
    @Body(new ZodValidationPipe(createMasterDataSchema))
    body: CreateMasterDataInput,
  ) {
    return {
      entry: await this.masterData.createCoded(
        this.actor(request),
        this.collection(collection),
        body,
      ),
    };
  }

  @RequirePermission('master_data.manage')
  @Patch(':collection/:id')
  @Documented({
    summary: 'Amend or deactivate a master-data entry.',
    description:
      'Labels and ordering are editable; the code is not. Setting `isActive: false` withdraws the ' +
      'value from new records while leaving every existing reference intact.',
    body: updateMasterDataSchema,
    responses: { 400: 'Unknown collection.', 404: 'No such entry.' },
  })
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('collection') collection: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateMasterDataSchema))
    body: UpdateMasterDataInput,
  ) {
    return {
      entry: await this.masterData.updateCoded(
        this.actor(request),
        this.collection(collection),
        id,
        body,
      ),
    };
  }

  private collection(value: string): CodedCollection {
    const match = CODED_COLLECTIONS.find((candidate) => candidate === value);
    if (!match) {
      throw new BadRequestException();
    }
    return match;
  }

  private actor(request: AuthenticatedRequest): ActorContext {
    if (!request.user) {
      throw new BadRequestException();
    }
    return {
      userId: request.user.id,
      requestId: request.header('x-request-id') ?? null,
      ipAddress: request.ip ?? null,
    };
  }
}
