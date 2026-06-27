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
    return this.usersRepo.findOne({ where: { azure_email: email } });
  }

  async updateAzureOid(userId: string, oid: string): Promise<void> {
    await this.usersRepo.update(userId, { azure_oid: oid });
  }

  async updateAzureEmail(userId: string, email: string): Promise<void> {
    await this.usersRepo.update(userId, { azure_email: email });
  }

  async updateRefreshToken(userId: string, token: string | null): Promise<void> {
    await this.usersRepo.update(userId, { refresh_token: token ?? undefined });
  }

  async create(data: Partial<User>): Promise<User> {
    const user = this.usersRepo.create(data);
    return this.usersRepo.save(user);
  }
}
