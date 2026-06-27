import {
  IsString,
  IsUUID,
  IsDateString,
  IsNumber,
  IsPositive,
  IsEmail,
  MinLength,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateEmployeeDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  full_name: string;

  @IsString()
  cin: string;

  @IsDateString()
  start_date: string;

  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  net_salary: number;

  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  gross_salary: number;
}

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  full_name?: string;

  @IsOptional()
  @IsString()
  cin?: string;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  net_salary?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  gross_salary?: number;
}
