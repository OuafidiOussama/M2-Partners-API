import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { DelegationsService, isDelegationActive } from './delegations.service';
import { Delegation } from './delegation.entity';
import { Employee } from '../employees/employee.entity';
import { User } from '../users/user.entity';
import { AuditService } from '../audit/audit.service';
import { Role } from '../common/enums/role.enum';

// "Today" for every test: Wednesday 2026-10-07.
const NOW = new Date(2026, 9, 7, 12, 0, 0);

const person = (id: string, extra: Partial<Employee> = {}) =>
  ({
    id,
    full_name: `Person ${id}`,
    job_title: null,
    avatar_url: null,
    is_active: true,
    user: { id: `user-${id}` },
    ...extra,
  }) as unknown as Employee;

const period = (
  start_date: string,
  end_date: string | null,
  cancelled_at: Date | null = null,
) => ({ start_date, end_date, cancelled_at });

function setup(opts: { role?: Role; delegations?: object[] } = {}) {
  const delegationsRepo = {
    find: jest.fn().mockResolvedValue(opts.delegations ?? []),
    findOne: jest.fn(),
    save: jest.fn((d: object) => Promise.resolve(d)),
  };
  const employeesRepo = { findOne: jest.fn() };
  const usersRepo = {
    findOne: jest
      .fn()
      .mockResolvedValue(opts.role ? { id: 'user-me', role: opts.role } : null),
  };
  const auditService = { log: jest.fn().mockResolvedValue(undefined) };

  // Transaction manager used by create().
  const manager = {
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn((d: object) =>
      Promise.resolve(
        Array.isArray(d) ? d : { id: 'del-new', created_at: NOW, ...d },
      ),
    ),
    create: jest.fn((_entity: unknown, d: object) => d),
  };
  const dataSource = {
    transaction: jest.fn((cb: (m: typeof manager) => unknown) => cb(manager)),
  };

  const service = new DelegationsService(
    delegationsRepo as unknown as Repository<Delegation>,
    employeesRepo as unknown as Repository<Employee>,
    usersRepo as unknown as Repository<User>,
    auditService as unknown as AuditService,
    dataSource as unknown as DataSource,
  );
  return {
    service,
    delegationsRepo,
    employeesRepo,
    usersRepo,
    auditService,
    manager,
  };
}

beforeAll(() => {
  jest.useFakeTimers({ now: NOW.getTime() });
});
afterAll(() => {
  jest.useRealTimers();
});

describe('isDelegationActive', () => {
  const today = '2026-10-07';

  it.each([
    ['started, open-ended', period('2026-10-01', null), true],
    ['started, ends later', period('2026-10-01', '2026-10-31'), true],
    ['starts today', period('2026-10-07', '2026-10-07'), true],
    ['ends today (inclusive)', period('2026-09-01', '2026-10-07'), true],
    ['expired yesterday', period('2026-09-01', '2026-10-06'), false],
    ['starts tomorrow', period('2026-10-08', null), false],
    ['cancelled', period('2026-10-01', null, new Date('2026-10-02')), false],
  ])('%s -> %s', (_label, d, expected) => {
    expect(isDelegationActive(d, today)).toBe(expected);
  });
});

describe('DelegationsService.canApprove', () => {
  it('is true for an ADMIN without looking at delegations', async () => {
    const { service, delegationsRepo } = setup({ role: Role.ADMIN });
    await expect(service.canApprove('user-me')).resolves.toBe(true);
    expect(delegationsRepo.find).not.toHaveBeenCalled();
  });

  it('is true for the delegate of an active delegation', async () => {
    const { service } = setup({
      role: Role.EMPLOYEE,
      delegations: [period('2026-10-01', '2026-10-31')],
    });
    await expect(service.canApprove('user-me')).resolves.toBe(true);
  });

  it('is false when the only delegation has expired', async () => {
    const { service } = setup({
      role: Role.EMPLOYEE,
      delegations: [period('2026-09-01', '2026-10-06')],
    });
    await expect(service.canApprove('user-me')).resolves.toBe(false);
  });

  it('is false when the only delegation was cancelled', async () => {
    const { service } = setup({
      role: Role.EMPLOYEE,
      delegations: [period('2026-10-01', null, new Date('2026-10-05'))],
    });
    await expect(service.canApprove('user-me')).resolves.toBe(false);
  });

  it('is false when the only delegation has not started yet', async () => {
    const { service } = setup({
      role: Role.EMPLOYEE,
      delegations: [period('2026-10-12', '2026-10-16')],
    });
    await expect(service.canApprove('user-me')).resolves.toBe(false);
  });

  it('is false for an employee with no delegations', async () => {
    const { service } = setup({ role: Role.EMPLOYEE });
    await expect(service.canApprove('user-me')).resolves.toBe(false);
  });

  it('is false for an unknown user', async () => {
    const { service } = setup();
    await expect(service.canApprove('nobody')).resolves.toBe(false);
  });
});

describe('DelegationsService.create', () => {
  const me = person('me');
  const cover = person('cover');

  function withPeople(s: ReturnType<typeof setup>, delegate = cover) {
    s.employeesRepo.findOne
      .mockResolvedValueOnce(me) // the caller (delegator)
      .mockResolvedValueOnce(delegate); // the delegate
    return s;
  }

  it('cancels the current/upcoming delegation and creates the new one', async () => {
    const s = withPeople(setup());
    const previous = {
      id: 'del-old',
      start_date: '2026-10-01',
      end_date: null,
      cancelled_at: null,
    };
    s.manager.find.mockResolvedValue([previous]);

    const result = await s.service.create(
      {
        delegate_id: 'cover',
        start_date: '2026-10-12',
        end_date: '2026-10-16',
      },
      'user-me',
    );

    expect(previous.cancelled_at).toBeInstanceOf(Date);
    expect(s.manager.save).toHaveBeenCalledWith([previous]);
    expect(result).toEqual({
      id: 'del-new',
      delegate: {
        id: 'cover',
        full_name: 'Person cover',
        job_title: null,
        avatar_url: null,
      },
      start_date: '2026-10-12',
      end_date: '2026-10-16',
      created_at: NOW.toISOString(),
    });
    expect(s.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'DELEGATION_CREATED',
        metadata: expect.objectContaining({
          cancelled: ['del-old'],
        }) as unknown,
      }),
    );
  });

  it('stores a missing end_date as open-ended (null)', async () => {
    const s = withPeople(setup());
    const result = await s.service.create(
      { delegate_id: 'cover', start_date: '2026-10-07' },
      'user-me',
    );
    expect(result.end_date).toBeNull();
  });

  it('rejects delegating to yourself', async () => {
    const s = setup();
    s.employeesRepo.findOne.mockResolvedValueOnce(me);
    await expect(
      s.service.create(
        { delegate_id: 'me', start_date: '2026-10-12' },
        'user-me',
      ),
    ).rejects.toThrow(
      new BadRequestException('You cannot delegate to yourself'),
    );
  });

  it('rejects an inactive delegate', async () => {
    const s = withPeople(setup(), person('cover', { is_active: false }));
    await expect(
      s.service.create(
        { delegate_id: 'cover', start_date: '2026-10-12' },
        'user-me',
      ),
    ).rejects.toThrow('The delegate must be an active employee');
  });

  it('rejects a start date in the past', async () => {
    const s = withPeople(setup());
    await expect(
      s.service.create(
        { delegate_id: 'cover', start_date: '2026-10-06' },
        'user-me',
      ),
    ).rejects.toThrow('Start date cannot be in the past');
  });

  it('rejects an end date before the start date', async () => {
    const s = withPeople(setup());
    await expect(
      s.service.create(
        {
          delegate_id: 'cover',
          start_date: '2026-10-12',
          end_date: '2026-10-09',
        },
        'user-me',
      ),
    ).rejects.toThrow('End date must be on or after the start date');
  });
});

describe('DelegationsService.cancel', () => {
  const delegation = (cancelled_at: Date | null = null) => ({
    id: 'del-1',
    cancelled_at,
    delegator: person('me'),
  });

  it('sets cancelled_at when the delegator cancels', async () => {
    const { service, delegationsRepo } = setup();
    const d = delegation();
    delegationsRepo.findOne.mockResolvedValue(d);

    await service.cancel('del-1', 'user-me');

    expect(d.cancelled_at).toBeInstanceOf(Date);
    expect(delegationsRepo.save).toHaveBeenCalledWith(d);
  });

  it('forbids anyone but the delegator', async () => {
    const { service, delegationsRepo } = setup();
    delegationsRepo.findOne.mockResolvedValue(delegation());
    await expect(service.cancel('del-1', 'user-other')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('404s for an unknown delegation', async () => {
    const { service, delegationsRepo } = setup();
    delegationsRepo.findOne.mockResolvedValue(null);
    await expect(service.cancel('nope', 'user-me')).rejects.toThrow(
      NotFoundException,
    );
  });
});
