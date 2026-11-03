import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { TeamsService } from './teams.service';
import { Team } from './team.entity';
import { Employee } from '../employees/employee.entity';
import { AuditService } from '../audit/audit.service';

const person = (id: string, full_name: string, is_active = true) =>
  ({
    id,
    full_name,
    job_title: null,
    avatar_url: null,
    is_active,
  }) as Employee;

const jill = person('e-jill', 'Jill Speirs');
const andrew = person('e-andrew', 'Andrew Speirs');
const hamid = person('e-hamid', 'Hamid Ouikene');
const people = [jill, andrew, hamid];

function setup(opts: { nameTaken?: boolean; team?: Team | null } = {}) {
  const teamsRepo = {
    find: jest.fn(),
    findOne: jest.fn().mockResolvedValue(opts.team ?? null),
    exists: jest.fn().mockResolvedValue(opts.nameTaken ?? false),
    create: jest.fn((d: Partial<Team>) => d),
    save: jest.fn((t: Team) => Promise.resolve({ ...t, id: t.id ?? 't-1' })),
  };
  const employeesRepo = {
    find: jest.fn(({ where }: { where: { id: { value: string[] } } }) =>
      Promise.resolve(people.filter((p) => where.id.value.includes(p.id))),
    ),
  };
  const auditService = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new TeamsService(
    teamsRepo as unknown as Repository<Team>,
    employeesRepo as unknown as Repository<Employee>,
    auditService as unknown as AuditService,
  );
  return { service, teamsRepo, auditService };
}

describe('TeamsService', () => {
  it('lists teams by name, members by full name, active members only', async () => {
    const { service, teamsRepo } = setup();
    teamsRepo.find.mockResolvedValue([
      { id: 't-2', name: 'sales', members: [] },
      {
        id: 't-1',
        name: 'Leadership',
        members: [person('e-x', 'Ex Employee', false), jill, andrew],
      },
    ]);

    const teams = await service.findAll();

    expect(teams.map((t) => t.name)).toEqual(['Leadership', 'sales']);
    expect(teams[0].members).toEqual([
      {
        id: 'e-andrew',
        full_name: 'Andrew Speirs',
        job_title: null,
        avatar_url: null,
      },
      {
        id: 'e-jill',
        full_name: 'Jill Speirs',
        job_title: null,
        avatar_url: null,
      },
    ]);
  });

  it('creates a team, ignoring repeated ids', async () => {
    const { service, auditService } = setup();
    const team = await service.create(
      { name: 'Growth', member_ids: ['e-andrew', 'e-andrew'] },
      'admin',
    );
    expect(team).toEqual({
      id: 't-1',
      name: 'Growth',
      members: [expect.objectContaining({ id: 'e-andrew' })],
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'TEAM_CREATED' }),
    );
  });

  it('creates an empty team', async () => {
    const { service } = setup();
    await expect(
      service.create({ name: 'New', member_ids: [] }, 'admin'),
    ).resolves.toMatchObject({ members: [] });
  });

  it('refuses a duplicate name (409)', async () => {
    const { service } = setup({ nameTaken: true });
    await expect(
      service.create({ name: 'growth', member_ids: [] }, 'admin'),
    ).rejects.toThrow(ConflictException);
  });

  it('refuses unknown employees (400)', async () => {
    const { service } = setup();
    await expect(
      service.create({ name: 'Growth', member_ids: ['e-ghost'] }, 'admin'),
    ).rejects.toThrow(BadRequestException);
  });

  it('replaces the membership on update', async () => {
    const team = { id: 't-1', name: 'Growth', members: [jill, andrew, hamid] };
    const { service, auditService } = setup({ team: team as Team });

    const updated = await service.update(
      't-1',
      { name: 'Growth', member_ids: ['e-hamid'] },
      'admin',
    );

    expect(updated.members.map((m) => m.id)).toEqual(['e-hamid']);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          name: 'Growth',
          added: [],
          removed: ['e-jill', 'e-andrew'],
        },
      }),
    );
  });

  it('answers 404 for an unknown team', async () => {
    const { service } = setup({ team: null });
    await expect(
      service.update('t-9', { name: 'X', member_ids: [] }, 'admin'),
    ).rejects.toThrow(NotFoundException);
  });
});
