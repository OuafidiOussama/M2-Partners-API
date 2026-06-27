import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';

interface LogParams {
  actorId: string;
  eventType: string;
  targetId?: string;
  targetType?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  async log(params: LogParams): Promise<void> {
    const entry = new AuditLog();
    entry.actor = { id: params.actorId } as any;
    entry.event_type = params.eventType;
    entry.target_id = params.targetId ?? null;
    entry.target_type = params.targetType ?? null;
    entry.metadata = params.metadata ?? null; // eslint-disable-line @typescript-eslint/no-explicit-any
    await this.auditRepo.save(entry);
  }

  findAll(filters: {
    actorId?: string;
    eventType?: string;
    from?: string;
    to?: string;
  }) {
    const qb = this.auditRepo
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.actor', 'actor')
      .orderBy('log.created_at', 'DESC');

    if (filters.actorId) {
      qb.andWhere('actor.id = :actorId', { actorId: filters.actorId });
    }
    if (filters.eventType) {
      qb.andWhere('log.event_type = :eventType', {
        eventType: filters.eventType,
      });
    }
    if (filters.from) {
      qb.andWhere('log.created_at >= :from', { from: filters.from });
    }
    if (filters.to) {
      qb.andWhere('log.created_at <= :to', { to: filters.to });
    }

    return qb.getMany();
  }
}
