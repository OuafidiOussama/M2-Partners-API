import { NotFoundException } from '@nestjs/common';
import { TeamService } from './team.service';
import { EmployeesService } from '../employees/employees.service';
import { LeavesService } from '../leaves/leaves.service';
import { Employee } from '../employees/employee.entity';

const employee = (is_active: boolean) =>
  ({
    id: 'emp-1',
    first_name: 'Andrew',
    last_name: 'Speirs',
    full_name: 'Andrew Speirs',
    is_active,
    start_date: '2016-03-23',
    line_manager: null,
    user: { email: 'andrew@m2.com' },
  }) as unknown as Employee;

function setup(emp: Employee) {
  const employeesService = { findOne: jest.fn().mockResolvedValue(emp) };
  const leavesService = {
    getAllowanceFor: jest.fn().mockResolvedValue({ year: 2026 }),
    findUpcoming: jest.fn().mockResolvedValue([{ id: 'leave-1' }]),
  };
  const service = new TeamService(
    employeesService as unknown as EmployeesService,
    leavesService as unknown as LeavesService,
  );
  return { service, leavesService };
}

describe('TeamService.getEmployeeSummary', () => {
  it('combines profile, allowance for the year and upcoming leave', async () => {
    const { service, leavesService } = setup(employee(true));

    const summary = await service.getEmployeeSummary('emp-1', 2026);

    expect(summary.profile).toMatchObject({
      id: 'emp-1',
      full_name: 'Andrew Speirs',
      email: 'andrew@m2.com',
    });
    expect(summary.allowance).toEqual({ year: 2026 });
    expect(summary.upcoming).toEqual([{ id: 'leave-1' }]);
    expect(leavesService.getAllowanceFor).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'emp-1' }),
      2026,
    );
    expect(leavesService.findUpcoming).toHaveBeenCalledWith('emp-1');
  });

  it('defaults to the current year', async () => {
    const { service, leavesService } = setup(employee(true));
    await service.getEmployeeSummary('emp-1');
    expect(leavesService.getAllowanceFor).toHaveBeenCalledWith(
      expect.anything(),
      new Date().getFullYear(),
    );
  });

  it('404s for an inactive employee', async () => {
    const { service } = setup(employee(false));
    await expect(service.getEmployeeSummary('emp-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
