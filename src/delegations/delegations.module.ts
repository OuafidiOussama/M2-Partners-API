import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Delegation } from './delegation.entity';
import { DelegationsService } from './delegations.service';
import { DelegationsController } from './delegations.controller';
import { Employee } from '../employees/employee.entity';
import { User } from '../users/user.entity';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Delegation, Employee, User]),
    AuditModule,
  ],
  providers: [DelegationsService],
  controllers: [DelegationsController],
  exports: [DelegationsService],
})
export class DelegationsModule {}
