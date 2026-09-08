import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';

import { AuditLogService } from '@/core/audit-log/audit-log.service';
import { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';
import { User } from '@/modules/users/entities/user.entity';
import { RbacCacheService } from '@/modules/rbac/services/rbac-cache.service';
import { UsersService } from '@/modules/users/services/users.service';

export type ProfileAccessType = 'self' | 'permission';

@Injectable()
export class UserProfileAccessGuard implements CanActivate {
  constructor(
    private readonly usersService: UsersService,
    private readonly rbacCacheService: RbacCacheService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<
      FastifyRequest & {
        user?: AuthenticatedUser;
        params: { userId: string };
        targetUser?: User;
        profileAccessType?: ProfileAccessType;
      }
    >();
    const currentUser = request.user;
    const userId = request.params.userId;

    if (!currentUser) {
      throw new ForbiddenException('User not authenticated');
    }

    const targetUser = await this.usersService.findById(userId);

    if (!targetUser) {
      await this.auditLogService.record({
        eventType: 'USER_PROFILE_NOT_FOUND',
        userId: currentUser.userId,
        request,
        metadata: { targetUserId: userId },
      });

      throw new NotFoundException('User not found');
    }

    if (currentUser.userId === userId) {
      request.targetUser = targetUser;
      request.profileAccessType = 'self';
      return true;
    }

    const hasPermission = this.rbacCacheService.hasPermission(
      currentUser.userId,
      'users',
      'read',
    );

    if (!hasPermission) {
      await this.auditLogService.record({
        eventType: 'USER_PROFILE_ACCESS_DENIED',
        userId: currentUser.userId,
        request,
        metadata: { targetUserId: userId },
      });

      throw new ForbiddenException('Insufficient permissions');
    }

    request.targetUser = targetUser;
    request.profileAccessType = 'permission';
    return true;
  }
}
