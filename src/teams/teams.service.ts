import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Raw, Repository } from 'typeorm';
import { Team } from './team.entity';
import { TeamDto } from './dto/team.dto';
import { Employee } from '../employees/employee.entity';
import { AuditService } from '../audit/audit.service';
import { isUniqueViolation } from '../common/utils/transform.util';
import { PersonSummary, toPersonSummary } from '../employees/employee.mapper';

export interface TeamView {
  id: string;
  name: string;
  members: PersonSummary[];
}

const byText = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: 'base' });

/** Active members only, by full name; built from the live employee records. */
export function toTeamView(team: Team): TeamView {
  return {
    id: team.id,
    name: team.name,
    members: team.members
      .filter((m) => m.is_active)
      .sort((a, b) => byText(a.full_name, b.full_name))
      .map(toPersonSummary),
  };
}

const duplicateName = (name: string) =>
  new ConflictException(`A team called "${name}" already exists`);

@Injectable()
export class TeamsService {
  constructor(
    @InjectRepository(Team)
    private readonly teamsRepo: Repository<Team>,
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
    private readonly auditService: AuditService,
  ) {}

  async findAll(): Promise<TeamView[]> {
    const teams = await this.teamsRepo.find({ relations: ['members'] });
    return teams.map(toTeamView).sort((a, b) => byText(a.name, b.name));
  }

  async create(dto: TeamDto, actorId: string): Promise<TeamView> {
    await this.assertNameFree(dto.name);
    const members = await this.findMembers(dto.member_ids);
    const saved = await this.save(
      this.teamsRepo.create({ name: dto.name, members }),
    );

    await this.auditService.log({
      actorId,
      eventType: 'TEAM_CREATED',
      targetId: saved.id,
      targetType: 'team',
      metadata: { name: saved.name, member_ids: members.map((m) => m.id) },
    });
    return toTeamView(saved);
  }

  /** `member_ids` is the complete new membership, not an addition. */
  async update(id: string, dto: TeamDto, actorId: string): Promise<TeamView> {
    const team = await this.teamsRepo.findOne({
      where: { id },
      relations: ['members'],
    });
    if (!team) throw new NotFoundException('We could not find this team');

    await this.assertNameFree(dto.name, id);
    const before = team.members.map((m) => m.id);
    team.name = dto.name;
    team.members = await this.findMembers(dto.member_ids);
    const saved = await this.save(team);

    const after = saved.members.map((m) => m.id);
    await this.auditService.log({
      actorId,
      eventType: 'TEAM_UPDATED',
      targetId: id,
      targetType: 'team',
      metadata: {
        name: saved.name,
        added: after.filter((m) => !before.includes(m)),
        removed: before.filter((m) => !after.includes(m)),
      },
    });
    return toTeamView(saved);
  }

  private async assertNameFree(name: string, exceptId?: string) {
    const taken = await this.teamsRepo.exists({
      where: {
        name: Raw((column) => `LOWER(${column}) = LOWER(:name)`, { name }),
        ...(exceptId ? { id: Not(exceptId) } : {}),
      },
    });
    if (taken) throw duplicateName(name);
  }

  /** Every id must be an active employee. */
  private async findMembers(ids: string[]): Promise<Employee[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const found = await this.employeesRepo.find({
      where: { id: In(unique), is_active: true },
    });
    if (found.length !== unique.length) {
      throw new BadRequestException(
        'Some of the selected people could not be found',
      );
    }
    return found;
  }

  private async save(team: Team): Promise<Team> {
    try {
      return await this.teamsRepo.save(team);
    } catch (err) {
      // Same name saved concurrently: caught by the LOWER(name) unique index.
      if (isUniqueViolation(err)) throw duplicateName(team.name);
      throw err;
    }
  }
}
