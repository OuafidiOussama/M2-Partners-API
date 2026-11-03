import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';

export const COMPANY_DOCUMENTS_DIR = 'company-documents';

/**
 * Abstracts file storage paths to allow future swap to S3 or other backends.
 */
@Injectable()
export class StorageService {
  private readonly storagePath: string;

  constructor(private readonly config: ConfigService) {
    this.storagePath = this.config.get<string>('STORAGE_PATH', './storage');
    fs.mkdirSync(path.join(this.storagePath, COMPANY_DOCUMENTS_DIR), {
      recursive: true,
    });
  }

  /** Absolute path for a storage key (a path relative to the storage root). */
  resolve(key: string): string {
    const root = path.resolve(this.storagePath);
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) {
      throw new Error(`Storage key escapes the storage root: ${key}`);
    }
    return full;
  }

  async write(key: string, data: Buffer): Promise<void> {
    const full = this.resolve(key);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, data);
  }

  exists(key: string): boolean {
    return fs.existsSync(this.resolve(key));
  }

  async remove(key: string): Promise<void> {
    await fs.promises.rm(this.resolve(key), { force: true });
  }
}
