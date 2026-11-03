import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { passportJwtSecret } from 'jwks-rsa';
import { UsersService } from '../users/users.service';

export interface AzureAdPayload {
  oid: string;
  preferred_username: string;
  name: string;
}

const NO_EMPLOYEE_MESSAGE =
  'Your Microsoft account does not match an active employee. Please contact HR.';

@Injectable()
export class AzureAdStrategy extends PassportStrategy(Strategy, 'azure-ad') {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const tenantId = config.get<string>('AZURE_TENANT_ID');
    const clientId = config.get<string>('AZURE_CLIENT_ID');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      audience: clientId,
      issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
      algorithms: ['RS256'],
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
      }),
    });
  }

  async validate(payload: AzureAdPayload) {
    if (!payload.oid || !payload.preferred_username) {
      throw new UnauthorizedException(
        'We could not verify your Microsoft sign-in.',
      );
    }

    let user = await this.usersService.findByAzureOid(payload.oid);

    if (!user) {
      const emailLower = payload.preferred_username.toLowerCase().trim();
      user = await this.usersService.findByEmail(emailLower);
      if (!user) {
        user = await this.usersService.findByAzureEmail(emailLower);
      }
      if (!user) {
        throw new UnauthorizedException(NO_EMPLOYEE_MESSAGE);
      }
    }

    if (!(await this.usersService.hasActiveEmployee(user.id))) {
      throw new UnauthorizedException(NO_EMPLOYEE_MESSAGE);
    }

    if (user.azure_oid !== payload.oid) {
      await this.usersService.updateAzureOid(user.id, payload.oid);
      await this.usersService.updateAzureEmail(
        user.id,
        payload.preferred_username,
      );
    }

    return {
      userId: user.id,
      oid: payload.oid,
      email: user.email,
      role: user.role,
      name: payload.name,
    };
  }
}
