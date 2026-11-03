import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { CompanyDocument } from './company-document.entity';
import { CreateCompanyDocumentDto } from './dto/company-document.dto';
import { AuditService } from '../audit/audit.service';
import {
  COMPANY_DOCUMENTS_DIR,
  StorageService,
} from '../common/services/storage.service';

export interface CompanyDocumentView {
  id: string;
  category: CompanyDocument['category'];
  title: string;
  file_name: string;
}

export interface UploadedDocumentFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

const toView = (d: CompanyDocument): CompanyDocumentView => ({
  id: d.id,
  category: d.category,
  title: d.title,
  file_name: d.file_name,
});

/** Keeps a download filename header-safe (no path parts, quotes or control chars). */
export function sanitizeFileName(name: string): string {
  const base = path
    .basename(name)
    .replace(/["\\\r\n]/g, '')
    .trim();
  return base || 'document';
}

@Injectable()
export class CompanyDocumentsService {
  constructor(
    @InjectRepository(CompanyDocument)
    private readonly docsRepo: Repository<CompanyDocument>,
    private readonly storage: StorageService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(): Promise<CompanyDocumentView[]> {
    const docs = await this.docsRepo.find({
      order: { sort_order: 'ASC', title: 'ASC' },
    });
    return docs.map(toView);
  }

  /** Resolves a document and the absolute path of its stored file. */
  async getDownload(
    id: string,
  ): Promise<{ doc: CompanyDocument; filePath: string }> {
    const doc = await this.docsRepo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('We could not find this document');
    if (!this.storage.exists(doc.storage_key)) {
      throw new NotFoundException('This document is not available right now');
    }
    return { doc, filePath: this.storage.resolve(doc.storage_key) };
  }

  async create(
    dto: CreateCompanyDocumentDto,
    file: UploadedDocumentFile,
    actorId: string,
  ): Promise<CompanyDocumentView> {
    const fileName = sanitizeFileName(file.originalname);
    const storageKey = path.posix.join(
      COMPANY_DOCUMENTS_DIR,
      `${uuidv4()}${path.extname(fileName)}`,
    );
    await this.storage.write(storageKey, file.buffer);

    let saved: CompanyDocument;
    try {
      saved = await this.docsRepo.save(
        this.docsRepo.create({
          category: dto.category,
          title: dto.title,
          sort_order: dto.sort_order ?? 0,
          file_name: fileName,
          storage_key: storageKey,
          mime_type: file.mimetype || 'application/octet-stream',
        }),
      );
    } catch (err) {
      await this.storage.remove(storageKey);
      throw err;
    }

    await this.auditService.log({
      actorId,
      eventType: 'COMPANY_DOCUMENT_CREATED',
      targetId: saved.id,
      targetType: 'company_document',
      metadata: { category: saved.category, title: saved.title, fileName },
    });

    return toView(saved);
  }

  async remove(id: string, actorId: string): Promise<void> {
    const doc = await this.docsRepo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('We could not find this document');

    await this.docsRepo.remove(doc);
    await this.storage.remove(doc.storage_key);

    await this.auditService.log({
      actorId,
      eventType: 'COMPANY_DOCUMENT_DELETED',
      targetId: id,
      targetType: 'company_document',
      metadata: { category: doc.category, title: doc.title },
    });
  }
}
