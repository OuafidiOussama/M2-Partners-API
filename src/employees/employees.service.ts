import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Employee } from './employee.entity';
import { User } from '../users/user.entity';
import {
  DEFAULT_SICK_TOTAL,
  LeaveAllowance,
  vacationTotalFor,
} from '../leaves/leave-allowance.entity';
import { AuditService } from '../audit/audit.service';
import { Role } from '../common/enums/role.enum';
import { isUniqueViolation } from '../common/utils/transform.util';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  UpdateMyProfileDto,
} from './dto/employee.dto';
import {
  DirectoryPerson,
  EmployeeProfile,
  diffProfileChange,
  toDirectoryPerson,
  toEmployeeProfile,
} from './employee.mapper';

const EMAIL_TAKEN = 'An employee with this email already exists';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(LeaveAllowance)
    private readonly allowanceRepo: Repository<LeaveAllowance>,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  // --- lookups -------------------------------------------------------------

  findAll(): Promise<Employee[]> {
    return this.employeesRepo.find({
      relations: ['user', 'line_manager'],
      order: { last_name: 'ASC', first_name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Employee> {
    const emp = await this.employeesRepo.findOne({
      where: { id },
      relations: ['user', 'line_manager'],
    });
    if (!emp) throw new NotFoundException('We could not find this employee');
    return emp;
  }

  async findByUserId(
    userId: string,
    opts: { withManager?: boolean } = {},
  ): Promise<Employee> {
    const emp = await this.employeesRepo.findOne({
      where: { user: { id: userId } },
      relations: opts.withManager ? ['user', 'line_manager'] : ['user'],
    });
    if (!emp) {
      throw new NotFoundException('We could not find your employee profile');
    }
    return emp;
  }

  async getMyProfile(userId: string): Promise<EmployeeProfile> {
    const emp = await this.findByUserId(userId, { withManager: true });
    return toEmployeeProfile(emp);
  }

  /** Active employees: those without a line manager first, then by last name. */
  async getDirectory(): Promise<DirectoryPerson[]> {
    const employees = await this.employeesRepo.find({
      where: { is_active: true },
      relations: ['line_manager'],
    });
    return sortDirectory(employees).map(toDirectoryPerson);
  }

  // --- admin CRUD ------------------------------------------------------------

  /**
   * Creates the user (matched to their Microsoft sign-in by email, ignoring
   * case) and the employee, with this year's allowance set by country.
   */
  async create(
    dto: CreateEmployeeDto,
    actorId: string,
  ): Promise<EmployeeProfile> {
    const { line_manager_id, ...fields } = dto;
    const email = dto.email.toLowerCase();
    const taken = await this.usersRepo
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :email OR LOWER(u.azure_email) = :email', {
        email,
      })
      .getExists();
    if (taken) throw new ConflictException(EMAIL_TAKEN);

    const lineManager = line_manager_id
      ? await this.findOne(line_manager_id)
      : null;

    let employee: Employee;
    try {
      employee = await this.dataSource.transaction(async (manager) => {
        const user = await manager.save(
          manager.create(User, { email, role: Role.EMPLOYEE }),
        );
        const emp = await manager.save(
          manager.create(Employee, {
            ...fields,
            user,
            line_manager: lineManager,
          }),
        );
        await manager.save(
          manager.create(LeaveAllowance, {
            employee: emp,
            year: new Date().getFullYear(),
            vacation_total: vacationTotalFor(emp.country_code),
            sick_total: DEFAULT_SICK_TOTAL,
          }),
        );
        return emp;
      });
    } catch (err) {
      // Same email created concurrently.
      if (isUniqueViolation(err)) throw new ConflictException(EMAIL_TAKEN);
      throw err;
    }

    await this.auditService.log({
      actorId,
      eventType: 'EMPLOYEE_CREATED',
      targetId: employee.id,
      targetType: 'employee',
      metadata: { email, full_name: employee.full_name },
    });

    return toEmployeeProfile(employee);
  }

  async update(
    id: string,
    dto: UpdateEmployeeDto,
    actorId: string,
  ): Promise<Employee> {
    const emp = await this.findOne(id);
    const { line_manager_id, ...fields } = dto;

    if (line_manager_id !== undefined) {
      if (line_manager_id === id) {
        throw new BadRequestException('An employee cannot manage themselves');
      }
      emp.line_manager = line_manager_id
        ? await this.findOne(line_manager_id)
        : null;
    }
    Object.assign(emp, fields);
    const saved = await this.employeesRepo.save(emp);

    await this.auditService.log({
      actorId,
      eventType: 'EMPLOYEE_UPDATED',
      targetId: id,
      targetType: 'employee',
      metadata: { changed: Object.keys(dto) },
    });

    return saved;
  }

  // --- own profile ----------------------------------------------------------

  /**
   * Applies the employee's own personal details at once. Anything else on the
   * profile is admin-only (see update()). The audit log keeps old and new values.
   */
  async updateMyProfile(
    dto: UpdateMyProfileDto,
    userId: string,
  ): Promise<EmployeeProfile> {
    const employee = await this.findByUserId(userId, { withManager: true });
    const changes = diffProfileChange(employee, dto);
    if (changes.length === 0) return toEmployeeProfile(employee);

    Object.assign(employee, dto);
    await this.dataSource.transaction(async (manager) => {
      await manager.save(employee);
      await this.auditService.log(
        {
          actorId: userId,
          eventType: 'PROFILE_UPDATED',
          targetId: employee.id,
          targetType: 'employee',
          metadata: { changes },
        },
        manager,
      );
    });

    return toEmployeeProfile(employee);
  }
}

export function sortDirectory(employees: Employee[]): Employee[] {
  return [...employees].sort((a, b) => {
    const aTop = a.line_manager ? 1 : 0;
    const bTop = b.line_manager ? 1 : 0;
    if (aTop !== bTop) return aTop - bTop;
    return (
      a.last_name.localeCompare(b.last_name) ||
      a.first_name.localeCompare(b.first_name)
    );
  });
}
