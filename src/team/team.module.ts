import { Module } from '@nestjs/common';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';
import { EmployeesModule } from '../employees/employees.module';
import { LeavesModule } from '../leaves/leaves.module';

@Module({
  imports: [EmployeesModule, LeavesModule],
  providers: [TeamService],
  controllers: [TeamController],
})
export class TeamModule {}
