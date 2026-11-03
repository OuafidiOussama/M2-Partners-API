import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepo
      .createQueryBuilder('u')
      .where('LOWER(u.email) = LOWER(:email)', { email })
      .getOne();
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { id } });
  }

  findByAzureOid(oid: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { azure_oid: oid } });
  }

  findByAzureEmail(email: string): Promise<User | null> {
    return this.usersRepo
      .createQueryBuilder('u')
      .where('LOWER(u.azure_email) = LOWER(:email)', { email })
      .getOne();
  }

  /** A user may only sign in when linked to an active employee record. */
  hasActiveEmployee(userId: string): Promise<boolean> {
    return this.usersRepo.exists({
      where: { id: userId, employee: { is_active: true } },
    });
  }

  async updateAzureOid(userId: string, oid: string): Promise<void> {
    await this.usersRepo.update(userId, { azure_oid: oid });
  }

  async updateAzureEmail(userId: string, email: string): Promise<void> {
    await this.usersRepo.update(userId, { azure_email: email });
  }

  async create(data: Partial<User>): Promise<User> {
    const user = this.usersRepo.create(data);
    return this.usersRepo.save(user);
  }
}
