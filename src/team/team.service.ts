import { Injectable, NotFoundException } from '@nestjs/common';
import { EmployeesService } from '../employees/employees.service';
import { LeavesService } from '../leaves/leaves.service';
import {
  EmployeeProfile,
  toEmployeeProfile,
} from '../employees/employee.mapper';
import { LeaveAllowanceView } from '../leaves/allowance.util';
import { LeaveRequestView } from '../leaves/leave.mapper';

export interface EmployeeSummary {
  profile: EmployeeProfile;
  allowance: LeaveAllowanceView;
  upcoming: LeaveRequestView[];
}

@Injectable()
export class TeamService {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly leavesService: LeavesService,
  ) {}

  /** Profile, allowance and upcoming leave of an active employee. */
  async getEmployeeSummary(
    id: string,
    year: number = new Date().getFullYear(),
  ): Promise<EmployeeSummary> {
    const employee = await this.employeesService.findOne(id);
    if (!employee.is_active) {
      throw new NotFoundException('We could not find this employee');
    }
    const [allowance, upcoming] = await Promise.all([
      this.leavesService.getAllowanceFor(employee, year),
      this.leavesService.findUpcoming(employee.id),
    ]);
    return { profile: toEmployeeProfile(employee), allowance, upcoming };
  }
}
