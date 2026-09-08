import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { FastifyRequest } from 'fastify';

import { AuditLogService } from '@/core/audit-log/audit-log.service';

interface PassportFailureInfo {
  name?: string;
  message?: string;
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly auditLogService: AuditLogService) {
    super();
  }

  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser | false,
    info: PassportFailureInfo | undefined,
    context: ExecutionContext,
    status?: unknown,
  ): TUser {
    // Only passport-level failures (missing/invalid/expired token) reach
    // here with no `err` and no `user` — rejections raised inside
    // JwtStrategy.validate() (wrong token type, user not found) already
    // audit themselves and arrive here as `err`, so they're not re-logged.
    if (!err && !user) {
      const request = context.switchToHttp().getRequest<FastifyRequest>();

      void this.auditLogService.record({
        eventType: 'ACCESS_TOKEN_REJECTED',
        request,
        metadata: { reason: this.reasonFor(info) },
      });
    }

    return super.handleRequest(err, user, info, context, status);
  }

  private reasonFor(info: PassportFailureInfo | undefined): string {
    if (info?.name === 'TokenExpiredError') {
      return 'jwt_expired';
    }

    if (info?.message === 'No auth token') {
      return 'missing_cookie';
    }

    return 'invalid_signature';
  }
}
