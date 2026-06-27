import {
  IsEnum,
  IsDateString,
  IsOptional,
  IsString,
} from 'class-validator';
import { LeaveType } from '../../common/enums/leave-type.enum';

export class CreateLeaveDto {
  @IsEnum(LeaveType)
  type: LeaveType;

  @IsDateString()
  start_date: string;

  @IsDateString()
  end_date: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class RejectLeaveDto {
  @IsString()
  reason: string;
}
