import { IsEnum } from 'class-validator';
import { DocumentType } from '../../common/enums/document-type.enum';

export class CreateDocumentRequestDto {
  @IsEnum(DocumentType)
  type: DocumentType;
}
