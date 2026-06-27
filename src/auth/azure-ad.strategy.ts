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
    console.log('[AzureAD] token claims:', JSON.stringify(payload, null, 2));

    if (!payload.oid || !payload.preferred_username) {
      console.log('[AzureAD] missing oid or preferred_username — full payload keys:', Object.keys(payload));
      throw new UnauthorizedException('Invalid Azure AD token claims');
    }

    let user = await this.usersService.findByAzureOid(payload.oid);
    console.log('[AzureAD] findByAzureOid result:', user?.id ?? 'null');

    if (!user) {
      const emailLower = payload.preferred_username.toLowerCase().trim();
      console.log('[AzureAD] falling back to email lookup:', emailLower);
      user = await this.usersService.findByEmail(emailLower);
      console.log('[AzureAD] findByEmail result:', user?.id ?? 'null');
      if (!user) {
        user = await this.usersService.findByAzureEmail(emailLower);
        console.log('[AzureAD] findByAzureEmail result:', user?.id ?? 'null');
      }
      if (!user) {
        throw new UnauthorizedException(
          'No employee account found for this Azure AD identity.',
        );
      }
      await this.usersService.updateAzureOid(user.id, payload.oid);
      await this.usersService.updateAzureEmail(user.id, payload.preferred_username);
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
