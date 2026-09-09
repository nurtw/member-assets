import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { MediaKind } from '@prisma/client';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service.js';
import { recogniseImage } from './image-type.js';
import { StoragePort } from './storage.service.js';

/** PRD §14.3 — a bound on what one upload may cost the service. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** How long a signed media link remains usable. */
const SIGNED_URL_TTL_SECONDS = 300;

export interface StoredMedia {
  id: string;
  kind: MediaKind;
  contentType: string;
  byteSize: number;
}

/**
 * Uploaded photographs and signatures.
 *
 * Two rules hold throughout:
 *
 * 1. **A file is what its bytes say it is.** The declared content type and the
 *    filename are caller-supplied and are never trusted, stored, or served.
 * 2. **Nothing is served without a signed link.** The bytes are members'
 *    personal data. A guessable or permanent URL would make a passport
 *    photograph readable by anyone who ever saw the link, indefinitely.
 */
@Injectable()
export class MediaService {
  /**
   * The link-signing secret.
   *
   * Falls back to a value generated at start-up, which invalidates outstanding
   * links on restart — inconvenient, and far better than a hard-coded default
   * that would let anyone holding the source mint links against production.
   */
  private readonly signingSecret =
    process.env.MEDIA_URL_SIGNING_SECRET ?? randomBytes(32).toString('hex');

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StoragePort,
  ) {}

  async upload(
    bytes: Buffer,
    kind: MediaKind,
  ): Promise<StoredMedia> {
    if (bytes.length === 0) {
      throw new BadRequestException('The uploaded file is empty.');
    }
    if (bytes.length > MAX_IMAGE_BYTES) {
      throw new BadRequestException('The uploaded file is too large.');
    }

    // The bytes decide. A caller may declare any type and name a file anything.
    const recognised = recogniseImage(bytes);
    if (!recognised) {
      throw new BadRequestException(
        'The file is not a JPEG, PNG, or WebP image.',
      );
    }

    const storageKey = await this.storage.put(bytes, recognised.extension);

    const asset = await this.prisma.mediaAsset.create({
      data: {
        kind,
        storageKey,
        contentType: recognised.contentType,
        byteSize: bytes.length,
      },
    });

    return {
      id: asset.id,
      kind: asset.kind,
      contentType: asset.contentType,
      byteSize: asset.byteSize,
    };
  }

  /**
   * A time-limited link to the bytes (Decision 10.2).
   *
   * The signature covers the asset id *and* the expiry, so neither can be
   * altered independently — signing the id alone would produce a link that never
   * expires however short the stated lifetime.
   */
  signUrl(assetId: string, now: Date = new Date()): { url: string; expiresAt: Date } {
    const expiresAt = new Date(now.getTime() + SIGNED_URL_TTL_SECONDS * 1000);
    const expiry = Math.floor(expiresAt.getTime() / 1000);
    const signature = this.sign(assetId, expiry);
    return {
      url: `/api/v1/media/${assetId}/content?expires=${expiry}&signature=${signature}`,
      expiresAt,
    };
  }

  async readSigned(
    assetId: string,
    expires: string,
    signature: string,
    now: Date = new Date(),
  ): Promise<{ bytes: Buffer; contentType: string }> {
    const expiry = Number.parseInt(expires, 10);
    if (!Number.isFinite(expiry)) {
      throw new NotFoundException();
    }
    if (expiry * 1000 < now.getTime()) {
      throw new NotFoundException();
    }
    if (!this.verify(assetId, expiry, signature)) {
      // Not "forbidden": a caller with an invalid signature learns nothing about
      // whether the asset exists.
      throw new NotFoundException();
    }

    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
    });
    if (!asset) {
      throw new NotFoundException();
    }

    return {
      bytes: await this.storage.get(asset.storageKey),
      contentType: asset.contentType,
    };
  }

  /** Confirms an asset exists and is of the expected kind, before attaching it. */
  async assertKind(assetId: string, kind: MediaKind): Promise<void> {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
      select: { kind: true },
    });
    if (!asset) {
      throw new BadRequestException('No such uploaded file.');
    }
    if (asset.kind !== kind) {
      throw new BadRequestException(
        `That file was uploaded as ${asset.kind} and cannot be used as ${kind}.`,
      );
    }
  }

  private sign(assetId: string, expiry: number): string {
    return createHmac('sha256', this.signingSecret)
      .update(`${assetId}.${expiry}`)
      .digest('base64url');
  }

  private verify(assetId: string, expiry: number, provided: string): boolean {
    const expected = Buffer.from(this.sign(assetId, expiry));
    const actual = Buffer.from(provided);
    // Constant-time, and length-checked first because timingSafeEqual throws on
    // a length mismatch rather than returning false.
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }
}
