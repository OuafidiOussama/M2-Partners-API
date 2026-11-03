import { applyDecorators } from '@nestjs/common';
import {
  IsIn,
  IsString,
  IsEmail,
  IsOptional,
  IsNotEmpty,
  IsEnum,
  IsUUID,
  IsBoolean,
  IsISO31661Alpha2,
  IsUrl,
  Matches,
  ValidateIf,
} from 'class-validator';
import { ContractType } from '../../common/enums/contract-type.enum';
import { IsIsoDate } from '../../common/utils/date.util';
import { Trim, TrimUpper } from '../../common/utils/transform.util';

const PHONE = /^\+?[\d\s()-]{7,}$/;
const PHONE_MESSAGE = '$property must be a valid phone number';
const COUNTRY_MESSAGE = '$property must be a 2-letter ISO country code';
const NEW_EMPLOYEE_COUNTRIES = ['CA', 'MA', 'GB'];

/** A non-blank string; "First name is required" when missing or blank. */
function RequiredText(): PropertyDecorator {
  const message = '$property is required';
  return applyDecorators(
    Trim(),
    IsString({ message }),
    IsNotEmpty({ message }),
  );
}

/** Optional admin-only fields shared by create / update. Null clears a value. */
class EmployeeAdminFieldsDto {
  @IsOptional()
  @Trim()
  @IsUrl(
    {
      protocols: ['http', 'https'],
      require_protocol: true,
      require_tld: false,
    },
    { message: '$property must be a full http(s) link to an image' },
  )
  avatar_url?: string | null;

  @IsOptional()
  @IsEnum(ContractType)
  contract_type?: ContractType;

  @IsOptional()
  @Trim()
  @IsString()
  work_hours?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  office?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  department?: string | null;

  @IsOptional()
  @IsUUID()
  line_manager_id?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

/** Everything listed is required; the allowance is never taken from the client. */
export class CreateEmployeeDto extends EmployeeAdminFieldsDto {
  @RequiredText()
  first_name: string;

  @RequiredText()
  last_name: string;

  @Trim()
  @IsEmail({}, { message: '$property must be a valid email address' })
  email: string;

  @RequiredText()
  job_title: string;

  @TrimUpper()
  @IsIn(NEW_EMPLOYEE_COUNTRIES, {
    message: '$property must be one of CA, MA or GB',
  })
  country_code: string;

  @IsIsoDate()
  start_date: string;

  @Trim()
  @Matches(PHONE, { message: PHONE_MESSAGE })
  mobile: string;

  @RequiredText()
  emergency_contact_name: string;

  @Trim()
  @Matches(PHONE, { message: PHONE_MESSAGE })
  emergency_contact_phone: string;
}

export class UpdateEmployeeDto extends EmployeeAdminFieldsDto {
  @IsOptional()
  @Trim()
  @IsString()
  job_title?: string | null;

  @IsOptional()
  @Trim()
  @Matches(PHONE, { message: PHONE_MESSAGE })
  mobile?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  emergency_contact_name?: string | null;

  @IsOptional()
  @Trim()
  @Matches(PHONE, { message: PHONE_MESSAGE })
  emergency_contact_phone?: string | null;

  @ValidateIf((_, value) => value !== undefined)
  @TrimUpper()
  @IsISO31661Alpha2({ message: COUNTRY_MESSAGE })
  country_code?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  first_name?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  last_name?: string;

  @IsOptional()
  @IsIsoDate()
  start_date?: string;
}

/** The personal details an employee may change on their own profile. */
export class UpdateMyProfileDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  first_name: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  last_name: string;

  @Trim()
  @Matches(PHONE, { message: PHONE_MESSAGE })
  mobile: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  emergency_contact_name: string;

  @Trim()
  @Matches(PHONE, { message: PHONE_MESSAGE })
  emergency_contact_phone: string;
}
