import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Team } from './team.entity';
import { TeamsService } from './teams.service';
import { TeamsController } from './teams.controller';
import { Employee } from '../employees/employee.entity';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([Team, Employee]), AuditModule],
  providers: [TeamsService],
  controllers: [TeamsController],
})
export class TeamsModule {}
