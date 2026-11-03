import { DataSource, Repository } from 'typeorm';
import { EmployeesService, sortDirectory } from './employees.service';
import { diffProfileChange, toEmployeeProfile } from './employee.mapper';
import { Employee } from './employee.entity';
import { User } from '../users/user.entity';

const emp = (
  first_name: string,
  last_name: string,
  hasManager: boolean,
  extra: Partial<Employee> = {},
): Employee =>
  ({
    id: `${first_name}-${last_name}`,
    first_name,
    last_name,
    full_name: `${first_name} ${last_name}`,
    job_title: null,
    avatar_url: null,
    department: null,
    line_manager: hasManager ? ({ id: 'mgr' } as Employee) : null,
    ...extra,
  }) as unknown as Employee;

describe('sortDirectory', () => {
  it('lists people without a line manager first, then by last name', () => {
    const sorted = sortDirectory([
      emp('Hamid', 'Ouikene', true),
      emp('Andrew', 'Speirs', true),
      emp('Jill', 'Speirs', false),
      emp('Amy', 'Adams', true),
    ]);
    expect(sorted.map((e) => e.full_name)).toEqual([
      'Jill Speirs',
      'Amy Adams',
      'Hamid Ouikene',
      'Andrew Speirs',
    ]);
  });
});

describe('EmployeesService.getDirectory', () => {
  it('returns active employees with their department, in directory order', async () => {
    const repo = {
      find: jest
        .fn()
        .mockResolvedValue([
          emp('Hamid', 'Ouikene', true, { department: 'Technology' }),
          emp('Jill', 'Speirs', false, { department: 'Leadership' }),
          emp('Youssef', 'Amrani', true),
        ]),
    };
    const service = new EmployeesService(
      repo as unknown as Repository<Employee>,
      // Collaborators getDirectory doesn't use.
      null as never,
      null as never,
      null as never,
      null as never,
    );

    const people = await service.getDirectory();

    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { is_active: true } }),
    );
    expect(people).toEqual([
      {
        id: 'Jill-Speirs',
        full_name: 'Jill Speirs',
        job_title: null,
        avatar_url: null,
        department: 'Leadership',
      },
      {
        id: 'Youssef-Amrani',
        full_name: 'Youssef Amrani',
        job_title: null,
        avatar_url: null,
        department: null,
      },
      {
        id: 'Hamid-Ouikene',
        full_name: 'Hamid Ouikene',
        job_title: null,
        avatar_url: null,
        department: 'Technology',
      },
    ]);
  });
});

describe('EmployeesService.updateMyProfile', () => {
  const details = {
    first_name: 'Andrew',
    last_name: 'Speirs',
    mobile: '+1 416 555 0142',
    emergency_contact_name: 'Jill Speirs',
    emergency_contact_phone: '+1 416 555 0101',
  };

  function setup() {
    const andrew = emp('Andrew', 'Speirs', true, {
      ...details,
      office: 'Toronto, Canada',
      user: { id: 'user-1' } as User,
    });
    const employeesRepo = { findOne: jest.fn().mockResolvedValue(andrew) };
    const manager = { save: jest.fn().mockResolvedValue(andrew) };
    const dataSource = {
      transaction: jest.fn((work: (m: typeof manager) => unknown) =>
        Promise.resolve(work(manager)),
      ),
    };
    const auditService = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new EmployeesService(
      employeesRepo as unknown as Repository<Employee>,
      null as never,
      null as never,
      auditService as never,
      dataSource as unknown as DataSource,
    );
    return { service, manager, auditService };
  }

  it('applies the new details at once and audits old and new values', async () => {
    const { service, manager, auditService } = setup();

    const profile = await service.updateMyProfile(
      { ...details, mobile: '+1 416 555 9999' },
      'user-1',
    );

    expect(profile.mobile).toBe('+1 416 555 9999');
    expect(manager.save).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PROFILE_UPDATED',
        metadata: {
          changes: [
            { field: 'mobile', from: details.mobile, to: '+1 416 555 9999' },
          ],
        },
      }),
      manager,
    );
  });

  it('writes nothing when no detail changed', async () => {
    const { service, manager, auditService } = setup();

    await expect(
      service.updateMyProfile(details, 'user-1'),
    ).resolves.toMatchObject({ mobile: details.mobile });

    expect(manager.save).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });
});

describe('diffProfileChange', () => {
  const current = {
    first_name: 'Hamid',
    last_name: 'Ouikene',
    mobile: '+212 661 000 001',
    emergency_contact_name: null,
    emergency_contact_phone: '+212 661 000 002',
  } as unknown as Employee;

  it('lists only the fields that differ, with from/to values', () => {
    expect(
      diffProfileChange(current, {
        first_name: 'Hamid',
        last_name: 'Ouikene',
        mobile: '+212 662 345 678',
        emergency_contact_name: 'Samira Ouikene',
        emergency_contact_phone: '+212 661 000 002',
      }),
    ).toEqual([
      {
        field: 'mobile',
        from: '+212 661 000 001',
        to: '+212 662 345 678',
      },
      { field: 'emergency_contact_name', from: null, to: 'Samira Ouikene' },
    ]);
  });

  it('is empty when nothing changes', () => {
    const requested = {
      first_name: 'Hamid',
      last_name: 'Ouikene',
      mobile: '+212 661 000 001',
      emergency_contact_name: 'Samira Ouikene',
      emergency_contact_phone: '+212 661 000 002',
    };
    expect(
      diffProfileChange(requested as unknown as Employee, requested),
    ).toEqual([]);
  });
});

describe('toEmployeeProfile', () => {
  it('only exposes an avatar the browser can load', () => {
    const avatar = (avatar_url: string | null) =>
      toEmployeeProfile(emp('A', 'B', false, { avatar_url })).avatar_url;

    expect(avatar('https://cdn.m2.com/a.jpg')).toBe('https://cdn.m2.com/a.jpg');
    expect(avatar('avatars/a.jpg')).toBeNull();
    expect(avatar(null)).toBeNull();
  });

  it('prefers the Azure email and exposes no auth fields', () => {
    const profile = toEmployeeProfile(
      emp('Andrew', 'Speirs', false, {
        user: {
          email: 'andrew@local',
          azure_email: 'andrew@m2.com',
          azure_oid: 'oid-secret',
        } as User,
      }),
    );

    expect(profile.email).toBe('andrew@m2.com');
    expect(JSON.stringify(profile)).not.toContain('oid-secret');
  });
});
