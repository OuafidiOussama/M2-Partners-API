import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Abstracts file storage paths to allow future swap to S3 or other backends.
 */
@Injectable()
export class StorageService {
  private readonly storagePath: string;

  constructor(private readonly config: ConfigService) {
    this.storagePath = this.config.get<string>('STORAGE_PATH', './storage');
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    const dirs = ['generated', 'signed'];
    for (const dir of dirs) {
      const fullPath = path.join(this.storagePath, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    }
  }

  generatedPath(filename: string): string {
    return path.join(this.storagePath, 'generated', filename);
  }

  signedPath(filename: string): string {
    return path.join(this.storagePath, 'signed', filename);
  }

  templatePath(type: string): string {
    return path.join(
      __dirname,
      '..',
      '..',
      'documents',
      'templates',
      `${type.toLowerCase()}.docx`,
    );
  }
}
