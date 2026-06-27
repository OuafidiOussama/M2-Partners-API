import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { LeaveRequest } from './leave-request.entity';
import { LeaveBalance } from './leave-balance.entity';
import { HolidaysService } from '../holidays/holidays.service';
import { EmployeesService } from '../employees/employees.service';
import { AuditService } from '../audit/audit.service';
import { LeaveType } from '../common/enums/leave-type.enum';
import { LeaveStatus } from '../common/enums/leave-status.enum';
import { calculateWorkingDays } from '../common/utils/working-days.util';
import { CreateLeaveDto, RejectLeaveDto } from './dto/leave.dto';

@Injectable()
export class LeavesService {
  constructor(
    @InjectRepository(LeaveRequest)
    private readonly leavesRepo: Repository<LeaveRequest>,
    @InjectRepository(LeaveBalance)
    private readonly balanceRepo: Repository<LeaveBalance>,
    private readonly holidaysService: HolidaysService,
    private readonly employeesService: EmployeesService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  async submit(dto: CreateLeaveDto, userId: string): Promise<LeaveRequest> {
    const employee = await this.employeesService.findByUserId(userId);
    const holidays = await this.holidaysService.getAllDates();

    const days = calculateWorkingDays(
      new Date(dto.start_date),
      new Date(dto.end_date),
      holidays,
    );

    if (days <= 0) {
      throw new BadRequestException(
        'Leave period must include at least one working day',
      );
    }

    const year = new Date(dto.start_date).getFullYear();
    let balance = await this.balanceRepo.findOne({
      where: { employee: { id: employee.id }, year },
    });

    if (!balance) {
      balance = this.balanceRepo.create({ employee, year });
      balance = await this.balanceRepo.save(balance);
    }

    const insufficient =
      (dto.type === LeaveType.SICK && days > balance.sick_days) ||
      (dto.type === LeaveType.VACATION && days > balance.vacation_days);

    if (insufficient) {
      const leave = this.leavesRepo.create({
        employee,
        type: dto.type,
        start_date: dto.start_date,
        end_date: dto.end_date,
        days,
        status: LeaveStatus.REJECTED,
        reason: dto.reason,
        admin_reason: 'Insufficient balance',
      });
      return this.leavesRepo.save(leave);
    }

    const leave = this.leavesRepo.create({
      employee,
      type: dto.type,
      start_date: dto.start_date,
      end_date: dto.end_date,
      days,
      status: LeaveStatus.PENDING,
      reason: dto.reason,
    });
    const saved = await this.leavesRepo.save(leave);

    await this.auditService.log({
      actorId: userId,
      eventType: 'LEAVE_SUBMITTED',
      targetId: saved.id,
      targetType: 'leave',
      metadata: { type: dto.type, days },
    });

    return saved;
  }

  findMyLeaves(userId: string): Promise<LeaveRequest[]> {
    return this.leavesRepo
      .createQueryBuilder('lr')
      .innerJoinAndSelect('lr.employee', 'emp')
      .innerJoin('emp.user', 'u')
      .where('u.id = :userId', { userId })
      .orderBy('lr.created_at', 'DESC')
      .getMany();
  }

  async getMyBalance(userId: string) {
    const employee = await this.employeesService.findByUserId(userId);
    const year = new Date().getFullYear();
    let balance = await this.balanceRepo.findOne({
      where: { employee: { id: employee.id }, year },
    });
    if (!balance) {
      balance = this.balanceRepo.create({ employee, year });
      balance = await this.balanceRepo.save(balance);
    }
    return balance;
  }

  findAll(filters: {
    status?: string;
    type?: string;
    employeeId?: string;
  }): Promise<LeaveRequest[]> {
    const qb = this.leavesRepo
      .createQueryBuilder('lr')
      .leftJoinAndSelect('lr.employee', 'emp')
      .leftJoinAndSelect('emp.user', 'u')
      .orderBy('lr.created_at', 'DESC');

    if (filters.status) {
      qb.andWhere('lr.status = :status', { status: filters.status });
    }
    if (filters.type) {
      qb.andWhere('lr.type = :type', { type: filters.type });
    }
    if (filters.employeeId) {
      qb.andWhere('emp.id = :employeeId', { employeeId: filters.employeeId });
    }

    return qb.getMany();
  }

  async approve(id: string, actorId: string): Promise<LeaveRequest> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const leave = await queryRunner.manager.findOne(LeaveRequest, {
        where: { id },
        relations: ['employee'],
      });
      if (!leave) throw new NotFoundException(`Leave ${id} not found`);
      if (leave.status !== LeaveStatus.PENDING) {
        throw new BadRequestException('Only pending leaves can be approved');
      }

      const year = new Date(leave.start_date).getFullYear();
      const balance = await queryRunner.manager.findOne(LeaveBalance, {
        where: { employee: { id: leave.employee.id }, year },
      });
      if (!balance) throw new NotFoundException('Leave balance not found');

      if (leave.type === LeaveType.VACATION) {
        balance.vacation_days -= leave.days;
      } else {
        balance.sick_days -= leave.days;
      }

      leave.status = LeaveStatus.APPROVED;

      await queryRunner.manager.save(balance);
      await queryRunner.manager.save(leave);
      await queryRunner.commitTransaction();

      await this.auditService.log({
        actorId,
        eventType: 'LEAVE_APPROVED',
        targetId: id,
        targetType: 'leave',
        metadata: { days: leave.days, type: leave.type },
      });

      return leave;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async reject(
    id: string,
    dto: RejectLeaveDto,
    actorId: string,
  ): Promise<LeaveRequest> {
    const leave = await this.leavesRepo.findOne({
      where: { id },
      relations: ['employee'],
    });
    if (!leave) throw new NotFoundException(`Leave ${id} not found`);

    leave.status = LeaveStatus.REJECTED;
    leave.admin_reason = dto.reason;
    const saved = await this.leavesRepo.save(leave);

    await this.auditService.log({
      actorId,
      eventType: 'LEAVE_REJECTED',
      targetId: id,
      targetType: 'leave',
      metadata: { reason: dto.reason },
    });

    return saved;
  }

  async cancel(id: string, userId: string): Promise<LeaveRequest> {
    const leave = await this.leavesRepo.findOne({
      where: { id },
      relations: ['employee', 'employee.user'],
    });
    if (!leave) throw new NotFoundException(`Leave ${id} not found`);

    if (leave.employee.user.id !== userId) {
      throw new BadRequestException('You can only cancel your own leave requests');
    }

    if (leave.status !== LeaveStatus.PENDING) {
      throw new BadRequestException('Only pending leave requests can be cancelled');
    }

    leave.status = LeaveStatus.CANCELLED;
    return this.leavesRepo.save(leave);
  }

  async forceApprove(id: string, actorId: string): Promise<LeaveRequest> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const leave = await queryRunner.manager.findOne(LeaveRequest, {
        where: { id },
        relations: ['employee'],
      });
      if (!leave) throw new NotFoundException(`Leave ${id} not found`);

      const year = new Date(leave.start_date).getFullYear();
      const balance = await queryRunner.manager.findOne(LeaveBalance, {
        where: { employee: { id: leave.employee.id }, year },
      });
      if (!balance) throw new NotFoundException('Leave balance not found');

      if (leave.type === LeaveType.VACATION) {
        balance.vacation_days -= leave.days;
      } else {
        balance.sick_days -= leave.days;
      }

      leave.status = LeaveStatus.APPROVED;

      await queryRunner.manager.save(balance);
      await queryRunner.manager.save(leave);
      await queryRunner.commitTransaction();

      await this.auditService.log({
        actorId,
        eventType: 'LEAVE_FORCE_APPROVED',
        targetId: id,
        targetType: 'leave',
        metadata: { days: leave.days, type: leave.type },
      });

      return leave;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
