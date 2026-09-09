import { Injectable, Logger } from '@nestjs/common';
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
 * A port with one adapter today. Production swaps the adapter for object storage
 * without the membership module knowing, which is Decision 12.1 in practice: no
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
