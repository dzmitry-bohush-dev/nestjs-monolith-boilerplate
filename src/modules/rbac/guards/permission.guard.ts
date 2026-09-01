import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { PermissionMetadata } from '../decorators/check-permission.decorator';
import { RbacCacheService } from '../services/rbac-cache.service';
import { AuditLogService } from '@/core/audit-log/audit-log.service';
import { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private rbacCacheService: RbacCacheService,
    private auditLogService: AuditLogService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.getAllAndOverride<PermissionMetadata>(
      'rbac:permission',
      [context.getHandler(), context.getClass()],
    );

    if (!metadata) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const hasPermission = this.rbacCacheService.hasPermission(
      user.userId,
      metadata.permission,
      metadata.action,
    );

    if (!hasPermission) {
      await this.auditLogService.record({
        eventType: 'RBAC_ACCESS_DENIED',
        userId: user.userId,
        request,
        metadata: {
          permission: metadata.permission,
          action: metadata.action,
        },
      });

      throw new ForbiddenException(
        `Insufficient permissions for ${metadata.permission}:${metadata.action}`,
      );
    }

    return true;
  }
}
