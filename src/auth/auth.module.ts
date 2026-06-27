import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AzureAdStrategy } from './azure-ad.strategy';
import { UsersModule } from '../users/users.module';
import { EmployeesModule } from '../employees/employees.module';

@Module({
  imports: [PassportModule, UsersModule, EmployeesModule],
  providers: [AuthService, AzureAdStrategy],
  controllers: [AuthController],
})
export class AuthModule {}
