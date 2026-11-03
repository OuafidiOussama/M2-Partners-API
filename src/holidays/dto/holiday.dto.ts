import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsIsoDate } from '../../common/utils/date.util';
import { Trim, TrimUpper } from '../../common/utils/transform.util';

const COUNTRY_CODE = /^[A-Z]{2}$/;
const COUNTRY_MESSAGE = '$property must be a 2-letter uppercase country code';
const SUPPORTED_COUNTRIES = ['CA', 'MA', 'GB'];
const YEAR_MESSAGE = '$property must be a valid year';

export class CreateHolidayDto {
  @IsIsoDate()
  date: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  label: string;

  @TrimUpper()
  @Matches(COUNTRY_CODE, { message: COUNTRY_MESSAGE })
  country_code: string;
}

export class HolidayQueryDto {
  @Type(() => Number)
  @IsInt({ message: YEAR_MESSAGE })
  @Min(2000, { message: YEAR_MESSAGE })
  @Max(2100, { message: YEAR_MESSAGE })
  year: number;

  @IsIn(SUPPORTED_COUNTRIES, {
    message: '$property must be one of CA, MA or GB',
  })
  country: string;
}
