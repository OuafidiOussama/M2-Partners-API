import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Request,
  Res,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { DocumentsService } from './documents.service';
import { CreateDocumentRequestDto } from './dto/document.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  request(
    @Body() dto: CreateDocumentRequestDto,
    @Request() req: { user: { userId: string } },
  ) {
    return this.documentsService.requestDocument(dto, req.user.userId);
  }

  @Get('my')
  getMyDocuments(@Request() req: { user: { userId: string } }) {
    return this.documentsService.findMyDocuments(req.user.userId);
  }

  @Get()
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  findAll() {
    return this.documentsService.findAll();
  }

  @Post(':id/generate')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  generate(
    @Param('id') id: string,
    @Request() req: { user: { userId: string } },
  ) {
    return this.documentsService.generate(id, req.user.userId);
  }

  @Get(':id/download')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  async download(@Param('id') id: string, @Res() res: Response) {
    const filePath = await this.documentsService.getFilePath(id);
    res.download(filePath);
  }

  @Post(':id/upload-signed')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './storage/signed',
        filename: (_req, file, cb) => {
          cb(null, `${uuidv4()}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  uploadSigned(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documentsService.saveSignedFile(id, file.path);
  }

  @Patch(':id/mark-downloadable')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  markDownloadable(@Param('id') id: string) {
    return this.documentsService.markDownloadable(id);
  }

  @Get(':id/employee-download')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  async employeeDownload(
    @Param('id') id: string,
    @Request() req: { user: { userId: string } },
    @Res() res: Response,
  ) {
    const filePath = await this.documentsService.getEmployeeDownloadPath(
      id,
      req.user.userId,
    );
    res.download(filePath);
  }
}
