import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeavesService } from './leaves.service';
import { LeavesController } from './leaves.controller';
import { LeaveRequest } from './leave-request.entity';
import { LeaveAllowance } from './leave-allowance.entity';
import { HolidaysModule } from '../holidays/holidays.module';
import { EmployeesModule } from '../employees/employees.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LeaveRequest, LeaveAllowance]),
    HolidaysModule,
    EmployeesModule,
    AuditModule,
  ],
  providers: [LeavesService],
  controllers: [LeavesController],
  exports: [LeavesService],
})
export class LeavesModule {}
