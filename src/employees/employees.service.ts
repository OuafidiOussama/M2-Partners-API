import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Employee } from './employee.entity';
import { User } from '../users/user.entity';
import { LeaveBalance } from '../leaves/leave-balance.entity';
import { AuditService } from '../audit/audit.service';
import { Role } from '../common/enums/role.enum';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(LeaveBalance)
    private readonly balanceRepo: Repository<LeaveBalance>,
    private readonly auditService: AuditService,
  ) {}

  async findAll(): Promise<Employee[]> {
    return this.employeesRepo.find({ relations: ['user'] });
  }

  async findOne(id: string): Promise<Employee> {
    const emp = await this.employeesRepo.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!emp) throw new NotFoundException(`Employee ${id} not found`);
    return emp;
  }

  async findByUserId(userId: string): Promise<Employee> {
    const emp = await this.employeesRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });
    if (!emp) throw new NotFoundException('Employee profile not found');
    return emp;
  }

  async findMe(userId: string) {
    const emp = await this.findByUserId(userId);
    return {
      id: emp.id,
      user_id: emp.user.id,
      full_name: emp.full_name,
      email: emp.user.email,
      cin: emp.cin,
      start_date: emp.start_date,
      net_salary: emp.net_salary,
      gross_salary: emp.gross_salary,
    };
  }

  async create(dto: CreateEmployeeDto, actorId: string): Promise<Employee> {
    const existing = await this.usersRepo.findOne({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already in use');

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = this.usersRepo.create({
      email: dto.email,
      password: hashedPassword,
      role: Role.EMPLOYEE,
    });
    await this.usersRepo.save(user);

    const employee = this.employeesRepo.create({
      user,
      full_name: dto.full_name,
      cin: dto.cin,
      start_date: dto.start_date,
      net_salary: dto.net_salary,
      gross_salary: dto.gross_salary,
    });
    await this.employeesRepo.save(employee);

    const year = new Date().getFullYear();
    const balance = this.balanceRepo.create({ employee, year });
    await this.balanceRepo.save(balance);

    await this.auditService.log({
      actorId,
      eventType: 'EMPLOYEE_CREATED',
      targetId: employee.id,
      targetType: 'employee',
      metadata: { email: dto.email, full_name: dto.full_name },
    });

    return employee;
  }

  async update(
    id: string,
    dto: UpdateEmployeeDto,
    actorId: string,
  ): Promise<Employee> {
    const emp = await this.findOne(id);
    Object.assign(emp, dto);
    const saved = await this.employeesRepo.save(emp);

    await this.auditService.log({
      actorId,
      eventType: 'EMPLOYEE_UPDATED',
      targetId: id,
      targetType: 'employee',
      metadata: { changes: dto },
    });

    return saved;
  }
}
