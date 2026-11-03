import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyDocumentsService } from './company-documents.service';
import { CompanyDocumentsController } from './company-documents.controller';
import { CompanyDocument } from './company-document.entity';
import { AuditModule } from '../audit/audit.module';
import { StorageService } from '../common/services/storage.service';

@Module({
  imports: [TypeOrmModule.forFeature([CompanyDocument]), AuditModule],
  providers: [CompanyDocumentsService, StorageService],
  controllers: [CompanyDocumentsController],
})
export class CompanyDocumentsModule {}
