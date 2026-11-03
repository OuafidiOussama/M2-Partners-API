import { IsOptional, IsUUID } from 'class-validator';
import { IsIsoDate } from '../../common/utils/date.util';

export class CreateDelegationDto {
  @IsUUID()
  delegate_id: string;

  @IsIsoDate()
  start_date: string;

  /** Omit (or null) for an open-ended delegation. */
  @IsOptional()
  @IsIsoDate()
  end_date?: string | null;
}
