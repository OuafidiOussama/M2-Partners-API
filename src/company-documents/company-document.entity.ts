import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { CompanyDocumentCategory } from '../common/enums/company-document-category.enum';

@Entity('company_documents')
export class CompanyDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: CompanyDocumentCategory })
  category: CompanyDocumentCategory;

  @Column()
  title: string;

  /** Filename offered to the browser on download. */
  @Column()
  file_name: string;

  /** Path relative to the StorageService root. */
  @Column()
  storage_key: string;

  @Column()
  mime_type: string;

  @Column({ default: 0 })
  sort_order: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
