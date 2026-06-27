import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import { DocumentRequest } from './document-request.entity';
import { EmployeesService } from '../employees/employees.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../common/services/storage.service';
import { DocumentStatus } from '../common/enums/document-status.enum';
import { DocumentType } from '../common/enums/document-type.enum';
import { CreateDocumentRequestDto } from './dto/document.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(DocumentRequest)
    private readonly docRepo: Repository<DocumentRequest>,
    private readonly employeesService: EmployeesService,
    private readonly auditService: AuditService,
    private readonly storageService: StorageService,
  ) {}

  async requestDocument(
    dto: CreateDocumentRequestDto,
    userId: string,
  ): Promise<DocumentRequest> {
    const employee = await this.employeesService.findByUserId(userId);
    const docRequest = this.docRepo.create({ employee, type: dto.type });
    return this.docRepo.save(docRequest);
  }

  findMyDocuments(userId: string): Promise<DocumentRequest[]> {
    return this.docRepo
      .createQueryBuilder('dr')
      .innerJoin('dr.employee', 'emp')
      .innerJoin('emp.user', 'u')
      .where('u.id = :userId', { userId })
      .orderBy('dr.created_at', 'DESC')
      .getMany();
  }

  findAll(): Promise<DocumentRequest[]> {
    return this.docRepo.find({
      relations: ['employee', 'employee.user'],
      order: { created_at: 'DESC' },
    });
  }

  private async findOneWithEmployee(id: string): Promise<DocumentRequest> {
    const doc = await this.docRepo.findOne({
      where: { id },
      relations: ['employee', 'employee.user'],
    });
    if (!doc) throw new NotFoundException(`Document request ${id} not found`);
    return doc;
  }

  async generate(id: string, actorId: string): Promise<DocumentRequest> {
    const doc = await this.findOneWithEmployee(id);
    const emp = doc.employee;

    const formattedDate = (d: string | Date) =>
      new Date(d).toLocaleDateString('fr-FR');

    const title =
      doc.type === DocumentType.WORK_CERTIFICATE
        ? 'Certificate of Employment'
        : 'Salary Certificate';

    const lines = [
      `Document Type: ${title}`,
      `Full Name: ${emp.full_name}`,
      `CIN: ${emp.cin}`,
      `Start Date: ${formattedDate(emp.start_date)}`,
      `Net Salary: ${emp.net_salary}`,
      `Gross Salary: ${emp.gross_salary}`,
      `Generated Date: ${formattedDate(new Date())}`,
    ];

    const document = new Document({
      sections: [
        {
          properties: {},
          children: lines.map(
            (line) =>
              new Paragraph({
                children: [new TextRun(line)],
              }),
          ),
        },
      ],
    });

    const buffer = await Packer.toBuffer(document);
    const filename = `${uuidv4()}.docx`;
    const filePath = this.storageService.generatedPath(filename);
    fs.writeFileSync(filePath, buffer);

    doc.file_path = filePath;
    doc.status = DocumentStatus.GENERATED;
    const saved = await this.docRepo.save(doc);

    await this.auditService.log({
      actorId,
      eventType: 'DOCUMENT_GENERATED',
      targetId: id,
      targetType: 'document',
      metadata: { type: doc.type, filename },
    });

    return saved;
  }

  async getFilePath(id: string): Promise<string> {
    const doc = await this.findOneWithEmployee(id);
    if (!doc.file_path)
      throw new NotFoundException('Generated file not available');
    return doc.file_path;
  }

  async saveSignedFile(id: string, filePath: string): Promise<DocumentRequest> {
    const doc = await this.findOneWithEmployee(id);
    doc.signed_path = filePath;
    return this.docRepo.save(doc);
  }

  async markDownloadable(id: string): Promise<DocumentRequest> {
    const doc = await this.findOneWithEmployee(id);
    doc.status = DocumentStatus.DOWNLOADABLE;
    return this.docRepo.save(doc);
  }

  async getEmployeeDownloadPath(id: string, userId: string): Promise<string> {
    const doc = await this.findOneWithEmployee(id);

    if (doc.employee.user.id !== userId) {
      throw new ForbiddenException('Access denied');
    }
    if (doc.status !== DocumentStatus.DOWNLOADABLE) {
      throw new ForbiddenException('Document not available for download yet');
    }
    if (!doc.signed_path)
      throw new NotFoundException('Signed file not available');
    return doc.signed_path;
  }
}
