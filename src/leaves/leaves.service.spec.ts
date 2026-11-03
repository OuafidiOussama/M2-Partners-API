import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource, FindOperator, Repository } from 'typeorm';
import { LeavesService } from './leaves.service';
import { LeaveRequest } from './leave-request.entity';
import { LeaveAllowance } from './leave-allowance.entity';
import { Employee } from '../employees/employee.entity';
import { HolidaysService } from '../holidays/holidays.service';
import { EmployeesService } from '../employees/employees.service';
import { AuditService } from '../audit/audit.service';
import { LeaveType } from '../common/enums/leave-type.enum';
import { LeaveStatus } from '../common/enums/leave-status.enum';
import { Role } from '../common/enums/role.enum';

// "Today" for every test: Wednesday 2026-10-07.
const NOW = new Date(2026, 9, 7, 12, 0, 0);

const manager = { id: 'mgr-1', full_name: 'Jill Speirs' } as Employee;

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-1',
    first_name: 'Andrew',
    last_name: 'Speirs',
    full_name: 'Andrew Speirs',
    job_title: 'Director',
    avatar_url: null,
    country_code: 'CA',
    line_manager: manager,
    user: { id: 'user-1' },
    ...overrides,
  } as Employee;
}

function setup(
  opts: {
    existing?: Partial<LeaveRequest>[];
    overlaps?: boolean;
    holidays?: string[];
    allowance?: Partial<LeaveAllowance>;
    employee?: Employee;
  } = {},
) {
  const leavesRepo = {
    find: jest.fn().mockResolvedValue(opts.existing ?? []),
    exists: jest.fn().mockResolvedValue(opts.overlaps ?? false),
    findOne: jest.fn(),
    findOneOrFail: jest.fn((): unknown => leavesRepo.findOne()),
    create: jest.fn((data: Partial<LeaveRequest>) => data),
    save: jest.fn((data: Partial<LeaveRequest>) =>
      Promise.resolve({ id: 'leave-new', created_at: NOW, ...data }),
    ),
  };
  const allowanceInsert = {
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
  };
  const allowanceRepo = {
    findOne: jest.fn().mockResolvedValue({
      vacation_total: 18,
      sick_total: 2,
      ...opts.allowance,
    }),
    findOneOrFail: jest.fn(),
    createQueryBuilder: jest.fn(() => allowanceInsert),
  };
  const employeeLock = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(null),
  };
  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === LeaveRequest) return leavesRepo;
      if (entity === LeaveAllowance) return allowanceRepo;
      return { createQueryBuilder: () => employeeLock };
    },
  };
  const dataSource = {
    transaction: jest.fn((work: (m: typeof manager) => unknown) =>
      Promise.resolve(work(manager)),
    ),
  };
  const holidaysService = {
    getAllDates: jest
      .fn()
      .mockResolvedValue((opts.holidays ?? []).map((d) => new Date(d))),
  };
  const employeesService = {
    findByUserId: jest.fn().mockResolvedValue(opts.employee ?? makeEmployee()),
  };
  const auditService = { log: jest.fn().mockResolvedValue(undefined) };

  const service = new LeavesService(
    leavesRepo as unknown as Repository<LeaveRequest>,
    allowanceRepo as unknown as Repository<LeaveAllowance>,
    holidaysService as unknown as HolidaysService,
    employeesService as unknown as EmployeesService,
    auditService as unknown as AuditService,
    dataSource as unknown as DataSource,
  );
  return {
    service,
    leavesRepo,
    allowanceRepo,
    allowanceInsert,
    employeeLock,
    holidaysService,
    auditService,
    dataSource,
  };
}

const firstCallArg = (fn: jest.Mock): unknown =>
  (fn.mock.calls as unknown[][])[0][0];

const approved = (days: number, type = LeaveType.VACATION) => ({
  type,
  status: LeaveStatus.APPROVED,
  days,
  start_date: '2026-03-02',
  end_date: '2026-03-06',
});
const pending = (days: number, type = LeaveType.VACATION) => ({
  type,
  status: LeaveStatus.PENDING,
  days,
  start_date: '2026-04-06',
  end_date: '2026-04-10',
});

beforeAll(() => {
  jest.useFakeTimers({ now: NOW.getTime() });
});
afterAll(() => {
  jest.useRealTimers();
});

describe('LeavesService.getMyAllowance', () => {
  it('derives taken / pending / remaining from requests', async () => {
    const { service } = setup({
      existing: [
        approved(5),
        approved(3),
        pending(2),
        approved(1, LeaveType.SICK),
      ],
    });

    await expect(service.getMyAllowance('user-1', 2026)).resolves.toEqual({
      year: 2026,
      vacation: { total: 18, taken: 8, pending: 2, remaining: 10 },
      sick: { total: 2, taken: 1, pending: 0, remaining: 1 },
    });
  });

  it.each([
    ['CA', 15],
    ['MA', 18],
    ['GB', 18],
  ])(
    'creates a missing %s allowance with %i vacation days',
    async (country_code, vacation_total) => {
      const { service, allowanceRepo, allowanceInsert } = setup({
        employee: makeEmployee({ country_code }),
      });
      allowanceRepo.findOne.mockResolvedValue(null);
      allowanceRepo.findOneOrFail.mockResolvedValue({
        vacation_total,
        sick_total: 2,
      });

      const result = await service.getMyAllowance('user-1', 2027);

      expect(allowanceInsert.values).toHaveBeenCalledWith(
        expect.objectContaining({ year: 2027, vacation_total, sick_total: 2 }),
      );
      expect(allowanceInsert.orIgnore).toHaveBeenCalled();
      expect(result.vacation.remaining).toBe(vacation_total);
    },
  );

  it('selects requests overlapping the requested year', async () => {
    const { service, leavesRepo } = setup();
    await service.getMyAllowance('user-1', 2026);

    const { where } = firstCallArg(leavesRepo.find) as {
      where: {
        start_date: FindOperator<string>;
        end_date: FindOperator<string>;
      };
    };
    expect(where.start_date.value).toBe('2026-12-31');
    expect(where.end_date.value).toBe('2026-01-01');
  });

  it('splits a request spanning New Year between the two years', async () => {
    // Wed 2026-12-30 -> Tue 2027-01-05, with Jan 1 off: 2 + 2 working days.
    const spanning = {
      ...approved(4),
      start_date: '2026-12-30',
      end_date: '2027-01-05',
    };
    const { service } = setup({
      existing: [spanning],
      holidays: ['2027-01-01'],
    });

    const in2026 = await service.getMyAllowance('user-1', 2026);
    const in2027 = await service.getMyAllowance('user-1', 2027);

    expect(in2026.vacation.taken).toBe(2);
    expect(in2027.vacation.taken).toBe(2);
  });

  it('reports a negative remaining when more was taken than allowed', async () => {
    const { service } = setup({ existing: [approved(21)] });
    const { vacation } = await service.getMyAllowance('user-1', 2026);
    expect(vacation.remaining).toBe(-3);
  });
});

describe('LeavesService.requestVacation', () => {
  it('creates a PENDING request counting working days only', async () => {
    // Mon 2026-10-12 is Thanksgiving (CA); Mon 12 -> Fri 16 = 4 working days.
    const { service, holidaysService, auditService } = setup({
      holidays: ['2026-10-12'],
    });

    const result = await service.requestVacation(
      { start_date: '2026-10-12', end_date: '2026-10-16', reason: 'Trip' },
      'user-1',
    );

    expect(holidaysService.getAllDates).toHaveBeenCalledWith('CA');
    expect(result).toMatchObject({
      type: LeaveType.VACATION,
      status: LeaveStatus.PENDING,
      days: 4,
      reason: 'Trip',
      admin_reason: null,
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'LEAVE_SUBMITTED' }),
      expect.anything(),
    );
  });

  it('rejects when the request exceeds remaining minus pending days', async () => {
    // 18 total - 13 taken = 5 remaining, 2 pending -> 3 requestable.
    const { service, leavesRepo } = setup({
      existing: [approved(13), pending(2)],
    });

    await expect(
      service.requestVacation(
        { start_date: '2026-10-12', end_date: '2026-10-16' },
        'user-1',
      ),
    ).rejects.toThrow(
      new BadRequestException('You only have 3 vacation days left in 2026'),
    );
    expect(leavesRepo.save).not.toHaveBeenCalled();
  });

  it('uses the singular for one remaining day', async () => {
    const { service } = setup({ existing: [approved(17)] });
    await expect(
      service.requestVacation(
        { start_date: '2026-10-12', end_date: '2026-10-13' },
        'user-1',
      ),
    ).rejects.toThrow('You only have 1 vacation day left in 2026');
  });

  it('rejects an overlapping request', async () => {
    const { service, leavesRepo } = setup({ overlaps: true });

    await expect(
      service.requestVacation(
        { start_date: '2026-10-12', end_date: '2026-10-16' },
        'user-1',
      ),
    ).rejects.toThrow('These dates overlap with an existing leave request');

    const { where } = firstCallArg(leavesRepo.exists) as {
      where: Record<string, FindOperator<unknown>>;
    };
    expect(where.start_date.type).toBe('lessThanOrEqual');
    expect(where.start_date.value).toBe('2026-10-16');
    expect(where.end_date.type).toBe('moreThanOrEqual');
    expect(where.end_date.value).toBe('2026-10-12');
    expect(where.status.value).toEqual([
      LeaveStatus.PENDING,
      LeaveStatus.APPROVED,
    ]);
    expect(leavesRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a weekend-only range', async () => {
    const { service } = setup();
    await expect(
      service.requestVacation(
        { start_date: '2026-10-10', end_date: '2026-10-11' },
        'user-1',
      ),
    ).rejects.toThrow('The selected dates contain no working days');
  });

  it('rejects a range made only of holidays', async () => {
    const { service } = setup({ holidays: ['2026-12-25'] });
    await expect(
      service.requestVacation(
        { start_date: '2026-12-25', end_date: '2026-12-27' },
        'user-1',
      ),
    ).rejects.toThrow('The selected dates contain no working days');
  });

  it('rejects an end date before the start date', async () => {
    const { service } = setup();
    await expect(
      service.requestVacation(
        { start_date: '2026-10-16', end_date: '2026-10-12' },
        'user-1',
      ),
    ).rejects.toThrow('End date must be on or after the start date');
  });

  it('rejects a start date in the past', async () => {
    const { service } = setup();
    await expect(
      service.requestVacation(
        { start_date: '2026-10-06', end_date: '2026-10-08' },
        'user-1',
      ),
    ).rejects.toThrow('Vacation cannot start in the past');
  });

  it('allows a request starting today', async () => {
    const { service } = setup();
    await expect(
      service.requestVacation(
        { start_date: '2026-10-07', end_date: '2026-10-07' },
        'user-1',
      ),
    ).resolves.toMatchObject({ days: 1 });
  });
});

describe('LeavesService.logSickDay', () => {
  it('records the sick day as APPROVED immediately', async () => {
    const { service, leavesRepo } = setup();

    const result = await service.logSickDay(
      { date: '2026-10-06', note: 'Flu' },
      'user-1',
    );

    expect(result).toMatchObject({
      type: LeaveType.SICK,
      status: LeaveStatus.APPROVED,
      start_date: '2026-10-06',
      end_date: '2026-10-06',
      days: 1,
      reason: 'Flu',
    });
    expect(leavesRepo.save).toHaveBeenCalledTimes(1);
  });

  it('is still recorded when the sick allowance is exhausted', async () => {
    const { service } = setup({
      existing: [approved(1, LeaveType.SICK), approved(1, LeaveType.SICK)],
    });
    await expect(
      service.logSickDay({ date: '2026-10-07' }, 'user-1'),
    ).resolves.toMatchObject({ status: LeaveStatus.APPROVED, reason: null });
  });

  it('notifies the line manager via the audit log', async () => {
    const { service, auditService } = setup();
    await service.logSickDay({ date: '2026-10-07' }, 'user-1');

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'SICK_DAY_MANAGER_NOTIFIED',
        metadata: expect.objectContaining({
          lineManagerId: 'mgr-1',
        }) as unknown,
      }),
      expect.anything(),
    );
  });

  it('skips the notification when there is no line manager', async () => {
    const { service, auditService } = setup({
      employee: makeEmployee({ line_manager: null }),
    });
    await service.logSickDay({ date: '2026-10-07' }, 'user-1');

    const events = auditService.log.mock.calls.map(
      ([p]: [{ eventType: string }]) => p.eventType,
    );
    expect(events).toEqual(['SICK_DAY_LOGGED']);
  });

  it('rejects a future date', async () => {
    const { service } = setup();
    await expect(
      service.logSickDay({ date: '2026-10-08' }, 'user-1'),
    ).rejects.toThrow('Sick days cannot be logged for a future date');
  });

  it('rejects a weekend', async () => {
    const { service } = setup();
    await expect(
      service.logSickDay({ date: '2026-10-04' }, 'user-1'),
    ).rejects.toThrow('The selected date is a weekend or public holiday');
  });

  it('rejects a stat holiday of the employee country', async () => {
    const { service } = setup({ holidays: ['2026-10-05'] });
    await expect(
      service.logSickDay({ date: '2026-10-05' }, 'user-1'),
    ).rejects.toThrow('The selected date is a weekend or public holiday');
  });
});

describe('LeavesService.getTeamAbsences', () => {
  it('queries APPROVED leaves of active employees overlapping the range', async () => {
    const jill = makeEmployee({
      id: 'emp-2',
      full_name: 'Jill Speirs',
      job_title: 'CEO',
    });
    const { service, leavesRepo } = setup({
      existing: [
        {
          id: 'l-1',
          type: LeaveType.SICK,
          start_date: '2026-10-05',
          end_date: '2026-10-05',
          employee: jill,
        },
      ],
    });

    const result = await service.getTeamAbsences('2026-10-05', '2026-10-11');

    expect(result).toEqual([
      {
        id: 'l-1',
        type: LeaveType.SICK,
        start_date: '2026-10-05',
        end_date: '2026-10-05',
        employee: {
          id: 'emp-2',
          full_name: 'Jill Speirs',
          job_title: 'CEO',
          avatar_url: null,
        },
      },
    ]);

    const { where } = firstCallArg(leavesRepo.find) as {
      where: {
        status: LeaveStatus;
        start_date: FindOperator<string>;
        end_date: FindOperator<string>;
        employee: { is_active: boolean };
      };
    };
    expect(where.status).toBe(LeaveStatus.APPROVED);
    // Overlap: starts on/before the range end and ends on/after its start.
    expect(where.start_date.type).toBe('lessThanOrEqual');
    expect(where.start_date.value).toBe('2026-10-11');
    expect(where.end_date.type).toBe('moreThanOrEqual');
    expect(where.end_date.value).toBe('2026-10-05');
    expect(where.employee).toEqual({ is_active: true });
  });

  it('accepts a range of any length', async () => {
    const { service } = setup();
    await expect(
      service.getTeamAbsences('2026-01-01', '2026-12-31'),
    ).resolves.toEqual([]);
  });

  it('rejects an inverted range', async () => {
    const { service } = setup();
    await expect(
      service.getTeamAbsences('2026-10-10', '2026-10-01'),
    ).rejects.toThrow('The end of the range must be on or after the start');
  });
});

describe('LeavesService.cancel', () => {
  const leave = (status: LeaveStatus, start_date: string) => ({
    id: 'leave-1',
    type: LeaveType.VACATION,
    status,
    start_date,
    end_date: start_date,
    days: 1,
    created_at: NOW,
    employee: makeEmployee(),
  });

  it('cancels a pending request, in a transaction with the audit entry', async () => {
    const { service, leavesRepo, dataSource, employeeLock, auditService } =
      setup();
    leavesRepo.findOne.mockResolvedValue(
      leave(LeaveStatus.PENDING, '2026-10-01'),
    );

    await expect(service.cancel('leave-1', 'user-1')).resolves.toMatchObject({
      status: LeaveStatus.CANCELLED,
    });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(employeeLock.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'LEAVE_CANCELLED' }),
      expect.anything(),
    );
  });

  it('cancels an approved request that has not started', async () => {
    const { service, leavesRepo } = setup();
    leavesRepo.findOne.mockResolvedValue(
      leave(LeaveStatus.APPROVED, '2026-10-08'),
    );
    await expect(service.cancel('leave-1', 'user-1')).resolves.toMatchObject({
      status: LeaveStatus.CANCELLED,
    });
  });

  it.each(['2026-10-07', '2026-10-01'])(
    'refuses an approved request that started on %s',
    async (start) => {
      const { service, leavesRepo } = setup();
      leavesRepo.findOne.mockResolvedValue(leave(LeaveStatus.APPROVED, start));
      await expect(service.cancel('leave-1', 'user-1')).rejects.toThrow(
        'Approved leave can only be cancelled before it starts',
      );
    },
  );

  it.each([LeaveStatus.REJECTED, LeaveStatus.CANCELLED])(
    'refuses a %s request',
    async (status) => {
      const { service, leavesRepo } = setup();
      leavesRepo.findOne.mockResolvedValue(leave(status, '2026-10-20'));
      await expect(service.cancel('leave-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    },
  );

  it("forbids cancelling someone else's request", async () => {
    const { service, leavesRepo } = setup();
    leavesRepo.findOne.mockResolvedValue(
      leave(LeaveStatus.PENDING, '2026-10-20'),
    );
    await expect(service.cancel('leave-1', 'user-2')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('answers with a readable message when the request is gone', async () => {
    const { service, leavesRepo } = setup();
    leavesRepo.findOne.mockResolvedValue(null);
    await expect(service.cancel('leave-1', 'user-1')).rejects.toThrow(
      'We could not find this leave request',
    );
  });
});

describe('LeavesService review (approvers)', () => {
  // The request belongs to Andrew (user-1).
  const pendingLeave = (days: number, status = LeaveStatus.PENDING) => ({
    id: 'leave-1',
    type: LeaveType.VACATION,
    status,
    start_date: '2026-11-02',
    end_date: '2026-11-06',
    days,
    reason: 'Trip',
    admin_reason: null,
    created_at: NOW,
    employee: makeEmployee(),
  });

  /** Another admin. */
  const ADMIN = { userId: 'admin-1', role: Role.ADMIN };
  /** Andrew himself, as an admin. */
  const ADMIN_SELF = { userId: 'user-1', role: Role.ADMIN };
  /** Andrew himself, approver only through a delegation. */
  const DELEGATE_SELF = { userId: 'user-1', role: Role.EMPLOYEE };
  /** Someone else who is approver only through a delegation. */
  const DELEGATE = { userId: 'user-2', role: Role.EMPLOYEE };

  const OWN_REQUEST_ERROR = new ForbiddenException(
    'You cannot approve or reject your own leave request',
  );

  describe('approve', () => {
    it("approves someone else's request without touching the allowance", async () => {
      const { service, leavesRepo, allowanceRepo } = setup({
        existing: [approved(10)],
      });
      leavesRepo.findOne.mockResolvedValue(pendingLeave(5));

      const result = await service.approve('leave-1', ADMIN);

      expect(result.status).toBe(LeaveStatus.APPROVED);
      expect(result.employee.full_name).toBe('Andrew Speirs');
      expect(leavesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ reviewed_by: 'admin-1' }),
      );
      expect(allowanceRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it("lets a delegate approve someone else's request", async () => {
      const { service, leavesRepo } = setup();
      leavesRepo.findOne.mockResolvedValue(pendingLeave(2));

      await expect(service.approve('leave-1', DELEGATE)).resolves.toMatchObject(
        { status: LeaveStatus.APPROVED },
      );
      expect(leavesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ reviewed_by: 'user-2' }),
      );
    });

    it('refuses when the remaining vacation allowance is too small', async () => {
      const { service, leavesRepo } = setup({ existing: [approved(16)] });
      leavesRepo.findOne.mockResolvedValue(pendingLeave(5));

      await expect(service.approve('leave-1', ADMIN)).rejects.toThrow(
        'Insufficient vacation allowance: 2 days remaining',
      );
    });

    it('lets an admin approve their own request, audit-logged as usual', async () => {
      const { service, leavesRepo, auditService } = setup();
      leavesRepo.findOne.mockResolvedValue(pendingLeave(3));

      const result = await service.approve('leave-1', ADMIN_SELF);

      expect(result.status).toBe(LeaveStatus.APPROVED);
      expect(leavesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ reviewed_by: 'user-1' }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'user-1',
          eventType: 'LEAVE_APPROVED',
          targetId: 'leave-1',
        }),
        expect.anything(),
      );
    });

    it("still re-checks the allowance on an admin's own request", async () => {
      const { service, leavesRepo } = setup({ existing: [approved(16)] });
      leavesRepo.findOne.mockResolvedValue(pendingLeave(5));

      await expect(service.approve('leave-1', ADMIN_SELF)).rejects.toThrow(
        'Insufficient vacation allowance: 2 days remaining',
      );
      expect(leavesRepo.save).not.toHaveBeenCalled();
    });

    it("still requires PENDING on an admin's own request", async () => {
      const { service, leavesRepo } = setup();
      leavesRepo.findOne.mockResolvedValue(
        pendingLeave(1, LeaveStatus.CANCELLED),
      );
      await expect(service.approve('leave-1', ADMIN_SELF)).rejects.toThrow(
        'Only pending leaves can be approved',
      );
    });

    it('forbids a delegate from approving their own request', async () => {
      const { service, leavesRepo } = setup();
      leavesRepo.findOne.mockResolvedValue(pendingLeave(1));

      await expect(service.approve('leave-1', DELEGATE_SELF)).rejects.toThrow(
        OWN_REQUEST_ERROR,
      );
      expect(leavesRepo.save).not.toHaveBeenCalled();
    });

    it('only approves pending requests', async () => {
      const { service, leavesRepo } = setup();
      leavesRepo.findOne.mockResolvedValue(
        pendingLeave(1, LeaveStatus.CANCELLED),
      );
      await expect(service.approve('leave-1', ADMIN)).rejects.toThrow(
        'Only pending leaves can be approved',
      );
    });
  });

  describe('reject', () => {
    it('rejects without a reason, storing admin_reason as null', async () => {
      const { service, leavesRepo, auditService } = setup();
      leavesRepo.findOne.mockResolvedValue(pendingLeave(3));

      const result = await service.reject('leave-1', {}, ADMIN);

      expect(result).toMatchObject({
        status: LeaveStatus.REJECTED,
        admin_reason: null,
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'LEAVE_REJECTED',
          metadata: { reason: null },
        }),
        expect.anything(),
      );
    });

    it('stores the reason when given', async () => {
      const { service, leavesRepo } = setup();
      leavesRepo.findOne.mockResolvedValue(pendingLeave(3));

      await expect(
        service.reject('leave-1', { reason: 'Busy week' }, ADMIN),
      ).resolves.toMatchObject({ admin_reason: 'Busy week' });
    });

    it('lets an admin reject their own request', async () => {
      const { service, leavesRepo, auditService } = setup();
      leavesRepo.findOne.mockResolvedValue(pendingLeave(3));

      await expect(
        service.reject('leave-1', {}, ADMIN_SELF),
      ).resolves.toMatchObject({ status: LeaveStatus.REJECTED });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'user-1',
          eventType: 'LEAVE_REJECTED',
        }),
        expect.anything(),
      );
    });

    it('forbids a delegate from rejecting their own request', async () => {
      const { service, leavesRepo } = setup();
      leavesRepo.findOne.mockResolvedValue(pendingLeave(3));

      await expect(
        service.reject('leave-1', {}, DELEGATE_SELF),
      ).rejects.toThrow(OWN_REQUEST_ERROR);
      expect(leavesRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('orders by start_date then created_at (newest first) and applies limit', async () => {
      const { service, leavesRepo } = setup({ existing: [pendingLeave(2)] });

      const result = await service.findAll({
        type: LeaveType.VACATION,
        limit: 8,
      });

      expect(result[0]).toMatchObject({
        id: 'leave-1',
        employee: { id: 'emp-1', full_name: 'Andrew Speirs' },
      });
      expect(leavesRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { type: LeaveType.VACATION },
          order: { start_date: 'DESC', created_at: 'DESC' },
          take: 8,
        }),
      );
    });
  });
});

describe('LeavesService.findUpcoming', () => {
  it('returns APPROVED/PENDING requests not yet ended, soonest first', async () => {
    const { service, leavesRepo } = setup();
    await service.findUpcoming('emp-1');

    const { where, order } = firstCallArg(leavesRepo.find) as {
      where: {
        employee: { id: string };
        status: FindOperator<LeaveStatus[]>;
        end_date: FindOperator<string>;
      };
      order: unknown;
    };
    expect(where.employee).toEqual({ id: 'emp-1' });
    expect(where.status.value).toEqual([
      LeaveStatus.PENDING,
      LeaveStatus.APPROVED,
    ]);
    // A request ending today still counts as upcoming.
    expect(where.end_date.type).toBe('moreThanOrEqual');
    expect(where.end_date.value).toBe('2026-10-07');
    expect(order).toEqual({ start_date: 'ASC' });
  });
});
