import { Injectable } from '@nestjs/common';
import { EmployeesService } from '../employees/employees.service';
import { DelegationsService } from '../delegations/delegations.service';
import { Role } from '../common/enums/role.enum';

@Injectable()
export class AuthService {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly delegationsService: DelegationsService,
  ) {}

  async me(userId: string, email: string, role: Role) {
    const [employee, canApprove] = await Promise.all([
      this.employeesService.findByUserId(userId),
      this.delegationsService.canApprove(userId),
    ]);
    return {
      userId,
      email,
      role,
      full_name: employee.full_name,
      can_approve: canApprove,
    };
  }
}
