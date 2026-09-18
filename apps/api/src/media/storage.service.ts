import { Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

/**
 * Where uploaded files live.
 *
 * `ARCHITECTURE.md` Decision 10.2 — passport photographs and signatures are held
 * in object storage, never in the repository and never in the database. The
 * database holds a reference; this holds the bytes.
 *
 * Two adapters: `LocalFilesystemStorage` for development, `CloudinaryStorage`
 * for production. `media.module.ts` picks between them from one environment
 * variable and nowhere else knows either exists — Decision 12.1: no
 * provider-specific interface is reachable from domain code.
 */
export abstract class StoragePort {
  /** Stores bytes and returns the key by which they can be read back. */
  abstract put(bytes: Buffer, extension: string): Promise<string>;
  abstract get(storageKey: string): Promise<Buffer>;
  abstract delete(storageKey: string): Promise<void>;
}

/**
 * Local filesystem, for development.
 *
 * The directory is gitignored. A passport photograph committed to the repository
 * would be a personal-data breach that survives in history and cannot be undone
 * by deleting the file.
 */
@Injectable()
export class LocalFilesystemStorage extends StoragePort {
  private readonly logger = new Logger(LocalFilesystemStorage.name);
  private readonly root: string;

  constructor() {
    super();
    this.root = resolve(process.env.MEDIA_STORAGE_DIR ?? 'var/media');
  }

  async put(bytes: Buffer, extension: string): Promise<string> {
    // Two levels of fan-out: a single directory holding tens of thousands of
    // member photographs is slow to list and unpleasant to work with.
    const id = randomUUID();
    const key = `${id.slice(0, 2)}/${id.slice(2, 4)}/${id}.${extension}`;
    const target = this.resolveKey(key);

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
    return key;
  }

  async get(storageKey: string): Promise<Buffer> {
    return readFile(this.resolveKey(storageKey));
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await unlink(this.resolveKey(storageKey));
    } catch (error) {
      // Already gone is the desired state, not a failure.
      this.logger.warn(`Could not remove ${storageKey}: ${String(error)}`);
    }
  }

  /**
   * Resolves a key beneath the storage root, and refuses anything that escapes.
   *
   * Keys are generated here rather than supplied by callers, so traversal should
   * be impossible — but "should be impossible" is how a path traversal reaches
   * production. The check costs nothing and holds even if a key later becomes
   * caller-influenced.
   */
  private resolveKey(storageKey: string): string {
    const target = resolve(join(this.root, storageKey));
    if (target !== this.root && !target.startsWith(this.root + sep)) {
      throw new Error('Refusing to access a path outside the storage root.');
    }
    return target;
  }
}

/** The three formats ever accepted by `recogniseImage` — see `image-type.ts`. */
const EXTENSION_TO_CONTENT_TYPE: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * Cloudinary, for production.
 *
 * Selected by `media.module.ts` when `CLOUDINARY_URL` is set — the SDK reads
 * that variable from the environment itself; this file passes it nowhere and
 * holds no credential of its own.
 *
 * Every asset uploads as `type: 'authenticated'`, never Cloudinary's public
 * default (`type: 'upload'`). CLAUDE.md requires bytes to be "served only
 * through a link signed over the id and an expiry" — a plain Cloudinary
 * delivery URL would bypass that however hard the public id is to guess, so
 * `get()` mints a short-lived Cloudinary-signed URL on every read rather than
 * ever handing one out. A caller still cannot reach this adapter without
 * first passing `MediaService.readSigned`'s own signature check — this is a
 * second, independent lock, not a replacement for the first.
 *
 * `storageKey` is `<public_id>.<extension>`, the same shape
 * `LocalFilesystemStorage` produces, so the database column and every caller
 * stay storage-agnostic. The same two-level fan-out, for the same reason:
 * ten thousand images in one Cloudinary folder is exactly as unpleasant as
 * ten thousand files in one directory.
 */
@Injectable()
export class CloudinaryStorage extends StoragePort {
  private readonly logger = new Logger(CloudinaryStorage.name);

  constructor() {
    super();
    // Merges onto the SDK's own auto-parse of CLOUDINARY_URL; does not
    // override the credentials it already read from it.
    cloudinary.config({ secure: true });
  }

  async put(bytes: Buffer, extension: string): Promise<string> {
    const id = randomUUID();
    const publicId = `media/${id.slice(0, 2)}/${id.slice(2, 4)}/${id}`;
    const contentType = EXTENSION_TO_CONTENT_TYPE[extension] ?? 'application/octet-stream';

    await cloudinary.uploader.upload(
      `data:${contentType};base64,${bytes.toString('base64')}`,
      {
        public_id: publicId,
        resource_type: 'image',
        type: 'authenticated',
        overwrite: false,
      },
    );

    return `${publicId}.${extension}`;
  }

  async get(storageKey: string): Promise<Buffer> {
    const { publicId, format } = this.parseKey(storageKey);
    const url = cloudinary.url(publicId, {
      resource_type: 'image',
      type: 'authenticated',
      format,
      sign_url: true,
      secure: true,
    });

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Cloudinary returned ${response.status} reading ${publicId}.`,
      );
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async delete(storageKey: string): Promise<void> {
    const { publicId } = this.parseKey(storageKey);
    try {
      // `invalidate: true` asks Cloudinary to also purge its CDN edge cache,
      // not only the origin copy — confirmed by hand that without it, a URL
      // this adapter had fetched once before deletion kept serving cached
      // bytes after `destroy` had already succeeded at the origin.
      // Cloudinary documents invalidation as best-effort, possibly taking up
      // to an hour to fully propagate, so treat this as a courtesy rather
      // than a guarantee.
      //
      // It is not a real exposure while it propagates: the URL it applies to
      // is Cloudinary's own signed delivery URL, minted fresh in `get()`
      // above and never returned to any caller outside this process — a
      // browser only ever holds this API's *own* signed link
      // (`MediaService.signUrl`), which 404s the instant `discard` deletes
      // the `media_asset` row, before `storage.get` is ever reached again,
      // whatever Cloudinary's CDN still has cached.
      await cloudinary.uploader.destroy(publicId, {
        resource_type: 'image',
        type: 'authenticated',
        invalidate: true,
      });
    } catch (error) {
      // Already gone is the desired state, not a failure — same reasoning as
      // the local adapter above.
      this.logger.warn(`Could not remove ${storageKey}: ${String(error)}`);
    }
  }

  private parseKey(storageKey: string): { publicId: string; format: string } {
    const lastDot = storageKey.lastIndexOf('.');
    return {
      publicId: storageKey.slice(0, lastDot),
      format: storageKey.slice(lastDot + 1),
    };
  }
}
