import {
  IsArray,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Trim } from '../../common/utils/transform.util';

/** Used for create and update; on update `member_ids` replaces the membership. */
export class TeamDto {
  @Trim()
  @IsString({ message: 'Team name is required' })
  @IsNotEmpty({ message: 'Team name cannot be blank' })
  @MaxLength(100, { message: 'Team name must be 100 characters or fewer' })
  name: string;

  // Listed first so a missing list reports the IsArray message below.
  @IsUUID('all', {
    each: true,
    message: 'Some of the selected people could not be found',
  })
  @IsArray({ message: '$property must be a list of employees' })
  member_ids: string[];
}
