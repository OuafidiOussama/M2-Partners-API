import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CompanyDocumentCategory } from '../../common/enums/company-document-category.enum';
import { Trim } from '../../common/utils/transform.util';

/** Multipart text fields sent alongside the uploaded `file`. */
export class CreateCompanyDocumentDto {
  @IsEnum(CompanyDocumentCategory)
  category: CompanyDocumentCategory;

  @Trim()
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;
}
