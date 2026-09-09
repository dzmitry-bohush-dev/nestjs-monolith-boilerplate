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
import { UsersService } from '@/modules/users/services/users.service';

@Injectable()
export class SelfOnlyGuard implements CanActivate {
  constructor(
    private readonly usersService: UsersService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<
      FastifyRequest & {
        user?: AuthenticatedUser;
        params: { userId: string };
        targetUser?: User;
      }
    >();
    const currentUser = request.user;
    const userId = request.params.userId;

    if (!currentUser) {
      throw new ForbiddenException('User not authenticated');
    }

    if (currentUser.userId !== userId) {
      await this.auditLogService.record({
        eventType: 'USER_EMAIL_CHANGE_ACCESS_DENIED',
        userId: currentUser.userId,
        request,
        metadata: { targetUserId: userId },
      });

      throw new ForbiddenException('Insufficient permissions');
    }

    const targetUser = await this.usersService.findById(userId);

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    request.targetUser = targetUser;
    return true;
  }
}
