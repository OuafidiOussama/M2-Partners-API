import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';
import { User } from '../users/user.entity';

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

  /** Pass `manager` to write the entry inside the caller's transaction. */
  async log(params: LogParams, manager?: EntityManager): Promise<void> {
    const entry = new AuditLog();
    entry.actor = { id: params.actorId } as User;
    entry.event_type = params.eventType;
    entry.target_id = params.targetId ?? null;
    entry.target_type = params.targetType ?? null;
    entry.metadata = params.metadata ?? null;
    const repo = manager?.getRepository(AuditLog) ?? this.auditRepo;
    await repo.save(entry);
  }
}
