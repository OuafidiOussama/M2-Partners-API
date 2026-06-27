import { Controller, Get, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Role } from '../common/enums/role.enum';

interface AzureAdUser {
  userId: string;
  oid: string;
  email: string;
  role: Role;
  name: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  me(@Request() req: { user: AzureAdUser }) {
    return this.authService.me(req.user.userId, req.user.email, req.user.role);
  }
}
