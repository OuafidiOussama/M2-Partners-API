import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { DocumentRequest } from './document-request.entity';
import { EmployeesModule } from '../employees/employees.module';
import { AuditModule } from '../audit/audit.module';
import { StorageService } from '../common/services/storage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentRequest]),
    EmployeesModule,
    AuditModule,
  ],
  providers: [DocumentsService, StorageService],
  controllers: [DocumentsController],
})
export class DocumentsModule {}
