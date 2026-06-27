import { Injectable } from '@nestjs/common';
import { EmployeesService } from '../employees/employees.service';
import { Role } from '../common/enums/role.enum';

@Injectable()
export class AuthService {
  constructor(private readonly employeesService: EmployeesService) {}

  async me(userId: string, email: string, role: Role) {
    const employee = await this.employeesService.findByUserId(userId);
    return {
      userId,
      email,
      role,
      full_name: employee.full_name,
    };
  }
}
