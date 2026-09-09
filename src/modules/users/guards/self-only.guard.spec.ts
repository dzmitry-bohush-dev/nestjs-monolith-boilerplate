import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { AuditLogService } from '@/core/audit-log/audit-log.service';
import { AuditLog } from '@/core/audit-log/entities/audit-log.entity';
import type { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';
import { User } from '@/modules/users/entities/user.entity';
import { SelfOnlyGuard } from '@/modules/users/guards/self-only.guard';
import { UsersService } from '@/modules/users/services/users.service';

describe('SelfOnlyGuard', () => {
  let guard: SelfOnlyGuard;
  let usersService: Partial<jest.Mocked<UsersService>>;
  let auditLogService: Partial<jest.Mocked<AuditLogService>>;

  const currentUser: AuthenticatedUser = {
    userId: 'user-1',
    email: 'user@example.com',
  };
  const targetUser = { id: 'user-1', email: 'user@example.com' } as User;
  const mockAuditLog = Object.assign(new AuditLog(), {
    id: 'log-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(() => {
    usersService = { findById: jest.fn() };
    auditLogService = { record: jest.fn().mockResolvedValue(mockAuditLog) };

    guard = new SelfOnlyGuard(
      usersService as unknown as UsersService,
      auditLogService as unknown as AuditLogService,
    );
  });

  const buildContext = (
    params: { userId: string },
    user: AuthenticatedUser | undefined,
  ): { context: ExecutionContext; request: Record<string, unknown> } => {
    const request: Record<string, unknown> = { params, user };
    const context = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(request),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;

    return { context, request };
  };

  describe('canActivate', () => {
    it('throws ForbiddenException if no user is authenticated', async () => {
      const { context } = buildContext({ userId: 'user-1' }, undefined);

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
      expect(usersService.findById).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException and records an audit event when userId does not match the current user', async () => {
      const { context } = buildContext({ userId: 'user-2' }, currentUser);

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );

      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'USER_EMAIL_CHANGE_ACCESS_DENIED',
          userId: 'user-1',
          metadata: { targetUserId: 'user-2' },
        }),
      );
      expect(usersService.findById).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the current user no longer exists', async () => {
      usersService.findById!.mockResolvedValue(null);
      const { context } = buildContext({ userId: 'user-1' }, currentUser);

      await expect(guard.canActivate(context)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('allows self access and sets request.targetUser', async () => {
      usersService.findById!.mockResolvedValue(targetUser);
      const { context, request } = buildContext(
        { userId: 'user-1' },
        currentUser,
      );

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(usersService.findById).toHaveBeenCalledWith('user-1');
      expect(request.targetUser).toBe(targetUser);
      expect(auditLogService.record).not.toHaveBeenCalled();
    });
  });
});
