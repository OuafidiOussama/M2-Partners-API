import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  ParseUUIDPipe,
  Post,
  Request,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CompanyDocumentsService } from './company-documents.service';
import { CreateCompanyDocumentDto } from './dto/company-document.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

// Vercel rejects request bodies over 4.5 MB, multipart overhead included.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

type AuthedRequest = { user: { userId: string } };

@Controller('company-documents')
export class CompanyDocumentsController {
  constructor(private readonly docsService: CompanyDocumentsService) {}

  @Get()
  findAll() {
    return this.docsService.findAll();
  }

  @Get(':id/download')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { doc, stream } = await this.docsService.getDownload(id);
    // attachment() emits `attachment; filename="<file_name>"` (plus filename*
    // for non-ASCII names); Content-Type is then pinned to the stored type.
    res.attachment(doc.file_name);
    res.setHeader('Content-Type', doc.mime_type);
    res.setHeader('Cache-Control', 'private, no-store');
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  @Post()
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  create(
    @Body() dto: CreateCompanyDocumentDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: MAX_UPLOAD_BYTES })],
      }),
    )
    file: Express.Multer.File,
    @Request() req: AuthedRequest,
  ) {
    return this.docsService.create(dto, file, req.user.userId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthedRequest,
  ) {
    return this.docsService.remove(id, req.user.userId);
  }
}
