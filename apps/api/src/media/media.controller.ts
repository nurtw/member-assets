import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { MediaKind } from '@prisma/client';
import type { Response } from 'express';

import { Public, RequirePermission } from '../auth/require-permission.decorator.js';
import { Documented } from '../docs/documented.decorator.js';
import { MAX_IMAGE_BYTES, MediaService } from './media.service.js';

/**
 * The part of multer's uploaded-file object this controller uses.
 *
 * Declared here rather than reaching for `Express.Multer.File`, which is a
 * global namespace augmentation that has to be wired into the compiler before it
 * resolves. Two fields are needed and both are guaranteed by memory storage,
 * which `FileInterceptor` uses when given no destination.
 *
 * Note what is deliberately absent: `mimetype` and `originalname`. Both are
 * caller-supplied, neither is evidence of anything, and a type that does not
 * expose them cannot be trusted by accident.
 */
interface UploadedFile {
  buffer: Buffer;
  size: number;
}

const UPLOADABLE_KINDS: readonly MediaKind[] = [
  'PASSPORT_PHOTOGRAPH',
  'MEMBER_SIGNATURE',
  'OFFICER_SIGNATURE',
  'COLLATERAL_EVIDENCE',
];

/**
 * Uploaded photographs and signatures (PRD §23.16, Decision 10.2).
 *
 * Uploading requires the registration permission. Reading does not — it requires
 * a signed link instead, because a browser rendering `<img>` sends no session
 * cookie to a different origin. The signature *is* the authorisation, it covers
 * the expiry, and it lasts five minutes.
 */
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @RequirePermission('member.create')
  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES } }),
  )
  @Documented({
    summary: 'Upload a photograph or signature.',
    description:
      'Multipart, field name `file`, with `kind` as a query parameter. The stored content ' +
      'type is determined by **sniffing the bytes** — the declared type and the filename are ' +
      'caller-supplied and are neither trusted nor retained. JPEG, PNG, and WebP only; SVG is ' +
      'refused because it carries script and would be stored cross-site scripting.',
    query: [
      {
        name: 'kind',
        description:
          'PASSPORT_PHOTOGRAPH, MEMBER_SIGNATURE, OFFICER_SIGNATURE, or COLLATERAL_EVIDENCE.',
        required: true,
      },
    ],
    responses: {
      400: 'No file, an unknown kind, an empty or oversized file, or bytes that are not a supported image.',
    },
  })
  async upload(
    @UploadedFile() file: UploadedFile | undefined,
    @Query('kind') kind?: string,
  ) {
    if (!file) {
      throw new BadRequestException('A file is required.');
    }
    const match = UPLOADABLE_KINDS.find((candidate) => candidate === kind);
    if (!match) {
      throw new BadRequestException('A valid media kind is required.');
    }

    const stored = await this.media.upload(file.buffer, match);
    return { media: stored, ...this.media.signUrl(stored.id) };
  }

  /**
   * Undo — discards an upload before it was attached to anything.
   *
   * Same permission as upload, because that is exactly what this reverses.
   * Refuses once the file is attached to a member, card, or officer
   * signature: those are history and this module has no route that deletes
   * one, ever (domain rule 5).
   */
  @RequirePermission('member.create')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Documented({
    summary: 'Discard an uploaded file that was never attached to a record.',
    description:
      'For an officer who uploaded the wrong file and wants to replace it before submitting. ' +
      'Refuses once the file is attached to a member, card, or officer signature — those are ' +
      'history and nothing in this module ever deletes one.',
    responses: {
      400: 'The file is already attached to a record.',
      404: 'No such uploaded file.',
    },
  })
  async discard(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.media.discard(id);
  }

  /**
   * The bytes, behind a signed link.
   *
   * Public in the sense that it carries no session requirement — but unreachable
   * without a signature this service minted, over both the asset id and the
   * expiry, within the last five minutes. Every failure answers 404, so an
   * invalid signature discloses nothing about whether the asset exists.
   */
  @Public()
  @Get(':id/content')
  @Documented({
    summary: 'Retrieve an uploaded file by signed link.',
    description:
      'Requires `expires` and `signature` as minted by the upload response. The signature ' +
      'covers the expiry as well as the identifier, so neither can be altered independently. ' +
      'An expired, altered, or absent signature answers 404 rather than 403, so a caller ' +
      'learns nothing about whether the file exists.',
    query: [
      { name: 'expires', description: 'Unix seconds, from the signed link.', required: true },
      { name: 'signature', description: 'From the signed link.', required: true },
    ],
    responses: { 404: 'No such file, or the link is expired, altered, or absent.' },
  })
  async content(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
    @Query('expires') expires?: string,
    @Query('signature') signature?: string,
  ): Promise<StreamableFile> {
    const { bytes, contentType } = await this.media.readSigned(
      id,
      expires ?? '',
      signature ?? '',
    );

    // The sniffed type is authoritative; stop the browser second-guessing it.
    response.setHeader('X-Content-Type-Options', 'nosniff');
    // Personal data. Never cached by a proxy shared with anybody else.
    response.setHeader('Cache-Control', 'private, max-age=60');

    // `StreamableFile`, not a bare `Buffer`. Nest serialises a returned object
    // as JSON, and a Buffer is an object — so a bare return produces
    // `{"type":"Buffer","data":[...]}` under a 200, which reads as a working
    // endpoint until somebody actually opens the image.
    return new StreamableFile(bytes, {
      type: contentType,
      disposition: 'inline',
    });
  }
}
