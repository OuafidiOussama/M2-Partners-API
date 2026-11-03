import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  FindOptionsWhere,
  IsNull,
  MoreThanOrEqual,
  Or,
  Repository,
} from 'typeorm';
import { Delegation } from './delegation.entity';
import { CreateDelegationDto } from './dto/delegation.dto';
import { Employee } from '../employees/employee.entity';
import { User } from '../users/user.entity';
import { AuditService } from '../audit/audit.service';
import { Role } from '../common/enums/role.enum';
import { todayIso } from '../common/utils/date.util';
import { PersonSummary, toPersonSummary } from '../employees/employee.mapper';

export interface DelegationView {
  id: string;
  delegate: PersonSummary;
  start_date: string;
  end_date: string | null;
  created_at: string;
}

type DelegationPeriod = Pick<
  Delegation,
  'start_date' | 'end_date' | 'cancelled_at'
>;

/** Active = not cancelled, already started and not yet ended (end inclusive). */
export function isDelegationActive(d: DelegationPeriod, today: string) {
  return (
    !d.cancelled_at &&
    d.start_date <= today &&
    (d.end_date === null || d.end_date >= today)
  );
}

export function toDelegationView(d: Delegation): DelegationView {
  return {
    id: d.id,
    delegate: toPersonSummary(d.delegate),
    start_date: d.start_date,
    end_date: d.end_date ?? null,
    created_at: new Date(d.created_at).toISOString(),
  };
}

/** Not cancelled and not yet over: current or upcoming. */
function notOver(today: string): FindOptionsWhere<Delegation> {
  return {
    cancelled_at: IsNull(),
    end_date: Or(IsNull(), MoreThanOrEqual(today)),
  };
}

@Injectable()
export class DelegationsService {
  constructor(
    @InjectRepository(Delegation)
    private readonly delegationsRepo: Repository<Delegation>,
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Single source of truth for "is approver": an ADMIN, or the delegate of a
   * currently active delegation.
   */
  async canApprove(userId: string): Promise<boolean> {
    const user = await this.usersRepo.findOne({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user) return false;
    if (user.role === Role.ADMIN) return true;

    const today = todayIso();
    const delegations = await this.delegationsRepo.find({
      where: { ...notOver(today), delegate: { user: { id: userId } } },
    });
    return delegations.some((d) => isDelegationActive(d, today));
  }

  /** The caller's current-or-upcoming delegation (latest start), or null. */
  async findMine(userId: string): Promise<DelegationView | null> {
    const delegator = await this.findEmployeeByUser(userId);
    const delegation = await this.delegationsRepo.findOne({
      where: { ...notOver(todayIso()), delegator: { id: delegator.id } },
      relations: ['delegate'],
      order: { start_date: 'DESC', created_at: 'DESC' },
    });
    return delegation ? toDelegationView(delegation) : null;
  }

  /** Creates a delegation, cancelling the caller's current/upcoming one. */
  async create(
    dto: CreateDelegationDto,
    userId: string,
  ): Promise<DelegationView> {
    const delegator = await this.findEmployeeByUser(userId);
    if (dto.delegate_id === delegator.id) {
      throw new BadRequestException('You cannot delegate to yourself');
    }
    const delegate = await this.employeesRepo.findOne({
      where: { id: dto.delegate_id },
    });
    if (!delegate || !delegate.is_active) {
      throw new BadRequestException('The delegate must be an active employee');
    }

    const today = todayIso(new Date(), delegator.country_code);
    const endDate = dto.end_date ?? null;
    if (dto.start_date < today) {
      throw new BadRequestException('Start date cannot be in the past');
    }
    if (endDate !== null && endDate < dto.start_date) {
      throw new BadRequestException(
        'End date must be on or after the start date',
      );
    }

    const { saved, cancelledIds } = await this.dataSource.transaction(
      async (manager) => {
        const previous = await manager.find(Delegation, {
          where: { ...notOver(today), delegator: { id: delegator.id } },
        });
        const now = new Date();
        for (const p of previous) p.cancelled_at = now;
        if (previous.length) await manager.save(previous);

        const created = await manager.save(
          manager.create(Delegation, {
            delegator,
            delegate,
            start_date: dto.start_date,
            end_date: endDate,
          }),
        );
        return { saved: created, cancelledIds: previous.map((p) => p.id) };
      },
    );

    await this.auditService.log({
      actorId: userId,
      eventType: 'DELEGATION_CREATED',
      targetId: saved.id,
      targetType: 'delegation',
      metadata: {
        delegateId: delegate.id,
        start_date: saved.start_date,
        end_date: saved.end_date,
        cancelled: cancelledIds,
      },
    });

    return toDelegationView(saved);
  }

  /** Only the delegator may cancel. Cancelling twice is a no-op. */
  async cancel(id: string, userId: string): Promise<void> {
    const delegation = await this.delegationsRepo.findOne({
      where: { id },
      relations: ['delegator', 'delegator.user'],
    });
    if (!delegation)
      throw new NotFoundException('We could not find this delegation');
    if (delegation.delegator.user?.id !== userId) {
      throw new ForbiddenException(
        'Only the person who created this delegation can cancel it',
      );
    }
    if (delegation.cancelled_at) return;

    delegation.cancelled_at = new Date();
    await this.delegationsRepo.save(delegation);

    await this.auditService.log({
      actorId: userId,
      eventType: 'DELEGATION_CANCELLED',
      targetId: id,
      targetType: 'delegation',
    });
  }

  private async findEmployeeByUser(userId: string): Promise<Employee> {
    const employee = await this.employeesRepo.findOne({
      where: { user: { id: userId } },
    });
    if (!employee) {
      throw new NotFoundException('We could not find your employee profile');
    }
    return employee;
  }
}
