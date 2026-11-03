import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { TeamService } from './team.service';
import { AllowanceQueryDto } from '../leaves/dto/leave.dto';
import { Approver } from '../auth/decorators/approver.decorator';

// Lives in its own module because it combines employees and leaves, which
// would otherwise import each other.
@Controller('employees')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get(':id/summary')
  @Approver()
  getSummary(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AllowanceQueryDto,
  ) {
    return this.teamService.getEmployeeSummary(id, query.year);
  }
}
