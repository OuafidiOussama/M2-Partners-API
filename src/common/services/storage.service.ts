import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import { Readable } from 'stream';
import type { ReadableStream as WebReadableStream } from 'stream/web';
import { BlobNotFoundError, del, get, head, put } from '@vercel/blob';

export const COMPANY_DOCUMENTS_DIR = 'company-documents';

/**
 * Stores files by key (a path relative to the storage root).
 *
 * - On Vercel the server's disk doesn't persist, so files go to a private
 *   Vercel Blob store. Connecting the store to the project sets
 *   BLOB_STORE_ID; BLOB_READ_WRITE_TOKEN works too, e.g. for running the seed
 *   from your machine against the hosted store.
 * - Otherwise (local development) files live under STORAGE_PATH.
 */
@Injectable()
export class StorageService {
  private readonly storagePath: string;
  private readonly useBlob: boolean;

  constructor(private readonly config: ConfigService) {
    this.useBlob = !!(
      this.config.get<string>('BLOB_STORE_ID') ||
      this.config.get<string>('BLOB_READ_WRITE_TOKEN')
    );
    this.storagePath = this.config.get<string>('STORAGE_PATH', './storage');
    if (!this.useBlob) {
      fs.mkdirSync(path.join(this.storagePath, COMPANY_DOCUMENTS_DIR), {
        recursive: true,
      });
    }
  }

  async write(key: string, data: Buffer, contentType: string): Promise<void> {
    if (this.useBlob) {
      await put(key, data, {
        access: 'private',
        contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return;
    }
    const full = this.resolve(key);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, data);
  }

  async exists(key: string): Promise<boolean> {
    if (!this.useBlob) return fs.existsSync(this.resolve(key));
    try {
      await head(key);
      return true;
    } catch (err) {
      if (err instanceof BlobNotFoundError) return false;
      throw err;
    }
  }

  /** Opens a stored file for reading, or returns null when there is none. */
  async read(key: string): Promise<Readable | null> {
    if (this.useBlob) {
      const result = await get(key, { access: 'private' });
      if (result?.statusCode !== 200) return null;
      return Readable.fromWeb(result.stream as WebReadableStream<Uint8Array>);
    }
    const full = this.resolve(key);
    return fs.existsSync(full) ? fs.createReadStream(full) : null;
  }

  async remove(key: string): Promise<void> {
    if (this.useBlob) {
      await del(key);
      return;
    }
    await fs.promises.rm(this.resolve(key), { force: true });
  }

  /** Absolute local path for a key; refuses keys that escape the storage root. */
  private resolve(key: string): string {
    const root = path.resolve(this.storagePath);
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) {
      throw new Error(`Storage key escapes the storage root: ${key}`);
    }
    return full;
  }
}
