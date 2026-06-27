import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { DocumentType } from '../common/enums/document-type.enum';
import { DocumentStatus } from '../common/enums/document-status.enum';

@Entity('document_requests')
export class DocumentRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Employee, (e) => e.document_requests, {
    onDelete: 'CASCADE',
  })
  employee: Employee;

  @Column({ type: 'enum', enum: DocumentType })
  type: DocumentType;

  @Column({ type: 'enum', enum: DocumentStatus, default: DocumentStatus.PENDING })
  status: DocumentStatus;

  @Column({ nullable: true, length: 500 })
  file_path: string;

  @Column({ nullable: true, length: 500 })
  signed_path: string;

  @CreateDateColumn()
  created_at: Date;
}
