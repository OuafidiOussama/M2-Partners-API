import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LeaveType } from '../../common/enums/leave-type.enum';
import { LeaveStatus } from '../../common/enums/leave-status.enum';
import { IsIsoDate } from '../../common/utils/date.util';
import { Trim } from '../../common/utils/transform.util';

const YEAR_MESSAGE = '$property must be a valid year';

export class RequestVacationDto {
  @IsIsoDate()
  start_date: string;

  @IsIsoDate()
  end_date: string;

  @IsOptional()
  @Trim()
  @IsString()
  reason?: string;
}

export class LogSickDayDto {
  @IsIsoDate()
  date: string;

  @IsOptional()
  @Trim()
  @IsString()
  note?: string;
}

export class AllowanceQueryDto {
  /** Defaults to the current year. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: YEAR_MESSAGE })
  @Min(2000, { message: YEAR_MESSAGE })
  @Max(2100, { message: YEAR_MESSAGE })
  year?: number;
}

export class TeamAbsenceQueryDto {
  @IsIsoDate()
  from: string;

  @IsIsoDate()
  to: string;
}

export class ApprovalQueryDto {
  @IsOptional()
  @IsEnum(LeaveStatus)
  status?: LeaveStatus;

  @IsOptional()
  @IsEnum(LeaveType)
  type?: LeaveType;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class RejectLeaveDto {
  @IsOptional()
  @Trim()
  @IsString()
  reason?: string;
}
