import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { FastifyRequest } from 'fastify';
import { Strategy } from 'passport-jwt';

import { AuditLogService } from '@/core/audit-log/audit-log.service';
import { ConfigService } from '@/core/config/config.service';
import {
  AuthenticatedUser,
  DecodedAccessTokenPayload,
} from '@/modules/auth/types/jwt-payload.type';
import { UsersService } from '@/modules/users/services/users.service';

const fromAccessTokenCookie = (request: FastifyRequest): string | null =>
  request.cookies?.access_token ?? null;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
    private readonly auditLogService: AuditLogService,
  ) {
    super({
      jwtFromRequest: fromAccessTokenCookie,
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET'),
      issuer: config.get('JWT_ISSUER'),
      audience: config.get('JWT_AUDIENCE'),
      passReqToCallback: true,
    });
  }

  async validate(
    request: FastifyRequest,
    payload: DecodedAccessTokenPayload,
  ): Promise<AuthenticatedUser> {
    if (payload.type !== 'access') {
      await this.auditLogService.record({
        eventType: 'ACCESS_TOKEN_REJECTED',
        request,
        metadata: { reason: 'wrong_token_type' },
      });

      throw new UnauthorizedException();
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      await this.auditLogService.record({
        eventType: 'ACCESS_TOKEN_REJECTED',
        request,
        metadata: { reason: 'user_not_found' },
      });

      throw new UnauthorizedException();
    }

    return { userId: user.id, email: user.email };
  }
}
