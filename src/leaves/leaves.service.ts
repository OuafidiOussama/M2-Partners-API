import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { LeaveRequest } from './leave-request.entity';
import {
  DEFAULT_SICK_TOTAL,
  LeaveAllowance,
  vacationTotalFor,
} from './leave-allowance.entity';
import { Employee } from '../employees/employee.entity';
import { HolidaysService } from '../holidays/holidays.service';
import { EmployeesService } from '../employees/employees.service';
import { AuditService } from '../audit/audit.service';
import { LeaveType } from '../common/enums/leave-type.enum';
import { LeaveStatus } from '../common/enums/leave-status.enum';
import { Role } from '../common/enums/role.enum';
import { ReviewActor } from '../common/review-actor';
import { calculateWorkingDays } from '../common/utils/working-days.util';
import { isoToDate, todayIso, yearOf } from '../common/utils/date.util';
import {
  ApprovalQueryDto,
  LogSickDayDto,
  RejectLeaveDto,
  RequestVacationDto,
} from './dto/leave.dto';
import {
  ApprovalRequest,
  LeaveRequestView,
  TeamAbsence,
  toApprovalRequest,
  toLeaveRequestView,
  toTeamAbsence,
} from './leave.mapper';
import {
  AllowanceBucket,
  LeaveAllowanceView,
  computeBucket,
  requestableDays,
} from './allowance.util';

const ACTIVE_STATUSES = [LeaveStatus.PENDING, LeaveStatus.APPROVED];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

@Injectable()
export class LeavesService {
  private readonly logger = new Logger(LeavesService.name);

  constructor(
    @InjectRepository(LeaveRequest)
    private readonly leavesRepo: Repository<LeaveRequest>,
    @InjectRepository(LeaveAllowance)
    private readonly allowanceRepo: Repository<LeaveAllowance>,
    private readonly holidaysService: HolidaysService,
    private readonly employeesService: EmployeesService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  // --- employee-facing -------------------------------------------------------

  async findMyLeaves(userId: string): Promise<LeaveRequestView[]> {
    const employee = await this.employeesService.findByUserId(userId);
    const leaves = await this.leavesRepo.find({
      where: { employee: { id: employee.id } },
      order: { created_at: 'DESC' },
    });
    return leaves.map(toLeaveRequestView);
  }

  async getMyAllowance(
    userId: string,
    year: number = new Date().getFullYear(),
  ): Promise<LeaveAllowanceView> {
    const employee = await this.employeesService.findByUserId(userId);
    return this.getAllowanceFor(employee, year);
  }

  async requestVacation(
    dto: RequestVacationDto,
    userId: string,
  ): Promise<LeaveRequestView> {
    const { start_date, end_date } = dto;
    if (end_date < start_date) {
      throw new BadRequestException(
        'End date must be on or after the start date',
      );
    }

    const employee = await this.employeesService.findByUserId(userId);
    if (start_date < todayIso(new Date(), employee.country_code)) {
      throw new BadRequestException('Vacation cannot start in the past');
    }
    const days = await this.countWorkingDays(employee, start_date, end_date);
    if (days <= 0) {
      throw new BadRequestException(
        'The selected dates contain no working days',
      );
    }

    const saved = await this.withEmployeeLock(employee.id, async (manager) => {
      await this.assertNoOverlap(employee.id, start_date, end_date, manager);
      await this.assertVacationFits(
        employee,
        { start_date, end_date, days },
        manager,
        requestableDays,
        (left, year) =>
          left === 0
            ? `You have no vacation days left in ${year}`
            : `You only have ${plural(left, 'vacation day')} left in ${year}`,
      );

      const repo = manager.getRepository(LeaveRequest);
      const leave = await repo.save(
        repo.create({
          employee,
          type: LeaveType.VACATION,
          start_date,
          end_date,
          days,
          status: LeaveStatus.PENDING,
          reason: dto.reason || null,
        }),
      );
      await this.auditService.log(
        {
          actorId: userId,
          eventType: 'LEAVE_SUBMITTED',
          targetId: leave.id,
          targetType: 'leave',
          metadata: { type: LeaveType.VACATION, days, start_date, end_date },
        },
        manager,
      );
      return leave;
    });

    return toLeaveRequestView(saved);
  }

  /** Sick days need no approval: recorded as APPROVED even past the allowance. */
  async logSickDay(
    dto: LogSickDayDto,
    userId: string,
  ): Promise<LeaveRequestView> {
    const { date } = dto;
    const employee = await this.employeesService.findByUserId(userId, {
      withManager: true,
    });
    if (date > todayIso(new Date(), employee.country_code)) {
      throw new BadRequestException(
        'Sick days cannot be logged for a future date',
      );
    }

    const days = await this.countWorkingDays(employee, date, date);
    if (days <= 0) {
      throw new BadRequestException(
        'The selected date is a weekend or public holiday',
      );
    }

    const saved = await this.withEmployeeLock(employee.id, async (manager) => {
      await this.assertNoOverlap(employee.id, date, date, manager);

      const repo = manager.getRepository(LeaveRequest);
      const leave = await repo.save(
        repo.create({
          employee,
          type: LeaveType.SICK,
          start_date: date,
          end_date: date,
          days,
          status: LeaveStatus.APPROVED,
          reason: dto.note || null,
        }),
      );
      await this.auditService.log(
        {
          actorId: userId,
          eventType: 'SICK_DAY_LOGGED',
          targetId: leave.id,
          targetType: 'leave',
          metadata: { date, days },
        },
        manager,
      );
      await this.notifyLineManager(employee, leave, userId, manager);
      return leave;
    });

    return toLeaveRequestView(saved);
  }

  /**
   * The owner may cancel a PENDING request, or an APPROVED one that has not
   * started. Allowances are derived from requests, so this restores the days.
   */
  async cancel(id: string, userId: string): Promise<LeaveRequestView> {
    const saved = await this.withLockedLeave(id, async (leave, manager) => {
      if (leave.employee.user.id !== userId) {
        throw new ForbiddenException(
          'You can only cancel your own leave requests',
        );
      }
      if (!ACTIVE_STATUSES.includes(leave.status)) {
        throw new BadRequestException(
          'Only pending or approved leave requests can be cancelled',
        );
      }
      const today = todayIso(new Date(), leave.employee.country_code);
      if (leave.status === LeaveStatus.APPROVED && leave.start_date <= today) {
        throw new BadRequestException(
          'Approved leave can only be cancelled before it starts',
        );
      }

      leave.status = LeaveStatus.CANCELLED;
      const updated = await manager.getRepository(LeaveRequest).save(leave);
      await this.auditService.log(
        {
          actorId: userId,
          eventType: 'LEAVE_CANCELLED',
          targetId: id,
          targetType: 'leave',
          metadata: { type: leave.type, days: leave.days },
        },
        manager,
      );
      return updated;
    });

    return toLeaveRequestView(saved);
  }

  /** APPROVED absences (both types) of active employees overlapping [from, to]. */
  async getTeamAbsences(from: string, to: string): Promise<TeamAbsence[]> {
    if (to < from) {
      throw new BadRequestException(
        'The end of the range must be on or after the start',
      );
    }

    const leaves = await this.leavesRepo.find({
      where: {
        status: LeaveStatus.APPROVED,
        start_date: LessThanOrEqual(to),
        end_date: MoreThanOrEqual(from),
        employee: { is_active: true },
      },
      relations: ['employee'],
      order: { start_date: 'ASC' },
    });
    return leaves.map(toTeamAbsence);
  }

  // --- approvers -------------------------------------------------------------

  /** Leave requests with their employee, newest start first. */
  async findAll(filters: ApprovalQueryDto): Promise<ApprovalRequest[]> {
    const where: FindOptionsWhere<LeaveRequest> = {};
    if (filters.status) where.status = filters.status;
    if (filters.type) where.type = filters.type;
    if (filters.employeeId) where.employee = { id: filters.employeeId };

    const leaves = await this.leavesRepo.find({
      where,
      relations: ['employee'],
      order: { start_date: 'DESC', created_at: 'DESC' },
      take: filters.limit,
    });
    return leaves.map(toApprovalRequest);
  }

  /** Approves a PENDING request; vacation must fit in the remaining days. */
  async approve(id: string, actor: ReviewActor): Promise<ApprovalRequest> {
    const actorId = actor.userId;
    const saved = await this.withLockedLeave(id, async (leave, manager) => {
      this.assertCanReview(leave, actor);
      if (leave.status !== LeaveStatus.PENDING) {
        throw new BadRequestException('Only pending leaves can be approved');
      }

      if (leave.type === LeaveType.VACATION) {
        await this.assertVacationFits(
          leave.employee,
          leave,
          manager,
          (bucket) => Math.max(0, bucket.remaining),
          (left) =>
            `Insufficient vacation allowance: ${plural(left, 'day')} remaining`,
        );
      }

      leave.status = LeaveStatus.APPROVED;
      leave.admin_reason = null;
      leave.reviewed_by = actorId;
      leave.reviewed_at = new Date();
      const updated = await manager.getRepository(LeaveRequest).save(leave);
      await this.auditService.log(
        {
          actorId,
          eventType: 'LEAVE_APPROVED',
          targetId: id,
          targetType: 'leave',
          metadata: { days: leave.days, type: leave.type },
        },
        manager,
      );
      return updated;
    });

    return toApprovalRequest(saved);
  }

  async reject(
    id: string,
    dto: RejectLeaveDto,
    actor: ReviewActor,
  ): Promise<ApprovalRequest> {
    const actorId = actor.userId;
    const saved = await this.withLockedLeave(id, async (leave, manager) => {
      this.assertCanReview(leave, actor);
      if (!ACTIVE_STATUSES.includes(leave.status)) {
        throw new BadRequestException(
          'Only pending or approved leaves can be rejected',
        );
      }

      const reason = dto.reason || null;
      leave.status = LeaveStatus.REJECTED;
      leave.admin_reason = reason;
      leave.reviewed_by = actorId;
      leave.reviewed_at = new Date();
      const updated = await manager.getRepository(LeaveRequest).save(leave);
      await this.auditService.log(
        {
          actorId,
          eventType: 'LEAVE_REJECTED',
          targetId: id,
          targetType: 'leave',
          metadata: { reason },
        },
        manager,
      );
      return updated;
    });

    return toApprovalRequest(saved);
  }

  // --- team / summaries ------------------------------------------------------

  /** APPROVED or PENDING requests that have not ended yet, soonest first. */
  async findUpcoming(employeeId: string): Promise<LeaveRequestView[]> {
    const leaves = await this.leavesRepo.find({
      where: {
        employee: { id: employeeId },
        status: In(ACTIVE_STATUSES),
        end_date: MoreThanOrEqual(todayIso()),
      },
      order: { start_date: 'ASC' },
    });
    return leaves.map(toLeaveRequestView);
  }

  // --- helpers ---------------------------------------------------------------

  /**
   * Runs `work` in one transaction, holding a lock on the employee so that
   * everything deciding on their allowance or overlaps runs one at a time.
   */
  private withEmployeeLock<T>(
    employeeId: string,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(Employee)
        .createQueryBuilder('employee')
        .select('employee.id')
        .where('employee.id = :employeeId', { employeeId })
        .setLock('pessimistic_write')
        .getOne();
      return work(manager);
    });
  }

  /** Runs `work` on the current state of a request, with its employee locked. */
  private async withLockedLeave<T>(
    id: string,
    work: (leave: LeaveRequest, manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const found = await this.leavesRepo.findOne({
      where: { id },
      relations: ['employee'],
    });
    if (!found) {
      throw new NotFoundException('We could not find this leave request');
    }
    return this.withEmployeeLock(found.employee.id, async (manager) => {
      const leave = await manager.getRepository(LeaveRequest).findOneOrFail({
        where: { id },
        relations: ['employee', 'employee.user'],
      });
      return work(leave, manager);
    });
  }

  /**
   * ADMINs may review any request, including their own; approvers who are only
   * approvers through a delegation may not review their own requests (403).
   */
  private assertCanReview(leave: LeaveRequest, actor: ReviewActor): void {
    const isOwn = leave.employee.user?.id === actor.userId;
    if (isOwn && actor.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'You cannot approve or reject your own leave request',
      );
    }
  }

  private async countWorkingDays(
    employee: Employee,
    start: string,
    end: string,
  ): Promise<number> {
    const holidays = await this.holidaysService.getAllDates(
      employee.country_code,
    );
    return calculateWorkingDays(isoToDate(start), isoToDate(end), holidays);
  }

  /** Working days of the range that fall in `year`. */
  private daysInYear(
    employee: Employee,
    start: string,
    end: string,
    year: number,
  ): Promise<number> {
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    return this.countWorkingDays(
      employee,
      start < from ? from : start,
      end > to ? to : end,
    );
  }

  /** Checks each calendar year the request touches against that year's allowance. */
  private async assertVacationFits(
    employee: Employee,
    request: Pick<LeaveRequest, 'start_date' | 'end_date' | 'days'>,
    manager: EntityManager,
    available: (vacation: AllowanceBucket) => number,
    shortfall: (left: number, year: number) => string,
  ): Promise<void> {
    const { start_date, end_date, days } = request;
    const firstYear = yearOf(start_date);
    const lastYear = yearOf(end_date);
    for (let year = firstYear; year <= lastYear; year++) {
      const needed =
        firstYear === lastYear
          ? days
          : await this.daysInYear(employee, start_date, end_date, year);
      const { vacation } = await this.getAllowanceFor(employee, year, manager);
      const left = available(vacation);
      if (needed > left) {
        throw new BadRequestException(shortfall(left, year));
      }
    }
  }

  private async assertNoOverlap(
    employeeId: string,
    start: string,
    end: string,
    manager: EntityManager,
  ): Promise<void> {
    const overlaps = await manager.getRepository(LeaveRequest).exists({
      where: {
        employee: { id: employeeId },
        status: In(ACTIVE_STATUSES),
        start_date: LessThanOrEqual(end),
        end_date: MoreThanOrEqual(start),
      },
    });
    if (overlaps) {
      throw new BadRequestException(
        'These dates overlap with an existing leave request',
      );
    }
  }

  /** A request spanning New Year only counts its days within `year`. */
  async getAllowanceFor(
    employee: Employee,
    year: number,
    manager?: EntityManager,
  ): Promise<LeaveAllowanceView> {
    const allowance = await this.getOrCreateAllowance(employee, year, manager);
    const repo = manager?.getRepository(LeaveRequest) ?? this.leavesRepo;
    const requests = await repo.find({
      select: {
        id: true,
        type: true,
        status: true,
        days: true,
        start_date: true,
        end_date: true,
      },
      where: {
        employee: { id: employee.id },
        status: In(ACTIVE_STATUSES),
        start_date: LessThanOrEqual(`${year}-12-31`),
        end_date: MoreThanOrEqual(`${year}-01-01`),
      },
    });
    const usage = await Promise.all(
      requests.map(async (r) =>
        yearOf(r.start_date) === yearOf(r.end_date)
          ? r
          : {
              ...r,
              days: await this.daysInYear(
                employee,
                r.start_date,
                r.end_date,
                year,
              ),
            },
      ),
    );
    return {
      year,
      vacation: computeBucket(
        allowance.vacation_total,
        usage,
        LeaveType.VACATION,
      ),
      sick: computeBucket(allowance.sick_total, usage, LeaveType.SICK),
    };
  }

  /** A new year's allowance follows the employee's country. */
  private async getOrCreateAllowance(
    employee: Employee,
    year: number,
    manager?: EntityManager,
  ): Promise<LeaveAllowance> {
    const repo = manager?.getRepository(LeaveAllowance) ?? this.allowanceRepo;
    const where = { employee: { id: employee.id }, year };
    const existing = await repo.findOne({ where });
    if (existing) return existing;
    // A failed insert would abort the caller's transaction, so a row created
    // concurrently by another request is ignored rather than caught.
    await repo
      .createQueryBuilder()
      .insert()
      .values({
        employee,
        year,
        vacation_total: vacationTotalFor(employee.country_code),
        sick_total: DEFAULT_SICK_TOTAL,
      })
      .orIgnore()
      .execute();
    return repo.findOneOrFail({ where });
  }

  private async notifyLineManager(
    employee: Employee,
    leave: LeaveRequest,
    actorId: string,
    entityManager: EntityManager,
  ): Promise<void> {
    const manager = employee.line_manager;
    if (!manager) return;

    // TODO(email): email the line manager once outbound mail is available.
    this.logger.log(
      `Sick day ${leave.start_date} logged by ${employee.full_name}; notifying line manager ${manager.full_name}`,
    );
    await this.auditService.log(
      {
        actorId,
        eventType: 'SICK_DAY_MANAGER_NOTIFIED',
        targetId: leave.id,
        targetType: 'leave',
        metadata: {
          employeeId: employee.id,
          lineManagerId: manager.id,
          date: leave.start_date,
        },
      },
      entityManager,
    );
  }
}
