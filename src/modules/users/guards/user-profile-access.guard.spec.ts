import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { Reflector } from '@nestjs/core';

import { AuditLogService } from '@/core/audit-log/audit-log.service';
import { AuditLog } from '@/core/audit-log/entities/audit-log.entity';
import type { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';
import { User } from '@/modules/users/entities/user.entity';
import { UserProfileAccessGuard } from '@/modules/users/guards/user-profile-access.guard';
import { RbacCacheService } from '@/modules/rbac/services/rbac-cache.service';
import { UsersService } from '@/modules/users/services/users.service';

describe('UserProfileAccessGuard', () => {
  let guard: UserProfileAccessGuard;
  let reflector: Partial<jest.Mocked<Reflector>>;
  let usersService: Partial<jest.Mocked<UsersService>>;
  let rbacCacheService: Partial<jest.Mocked<RbacCacheService>>;
  let auditLogService: Partial<jest.Mocked<AuditLogService>>;

  const currentUser: AuthenticatedUser = {
    userId: 'user-1',
    email: 'user@example.com',
  };
  const targetUser = { id: 'user-2', email: 'target@example.com' } as User;
  const mockAuditLog = Object.assign(new AuditLog(), {
    id: 'log-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) };
    usersService = { findById: jest.fn() };
    rbacCacheService = { hasPermission: jest.fn() };
    auditLogService = { record: jest.fn().mockResolvedValue(mockAuditLog) };

    guard = new UserProfileAccessGuard(
      reflector as unknown as Reflector,
      usersService as unknown as UsersService,
      rbacCacheService as unknown as RbacCacheService,
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
      const { context } = buildContext({ userId: 'user-2' }, undefined);

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
      expect(usersService.findById).not.toHaveBeenCalled();
    });

    it('throws NotFoundException and records an audit event when the target user does not exist', async () => {
      usersService.findById!.mockResolvedValue(null);
      const { context } = buildContext({ userId: 'missing-id' }, currentUser);

      await expect(guard.canActivate(context)).rejects.toThrow(
        NotFoundException,
      );

      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'USER_PROFILE_NOT_FOUND',
          userId: 'user-1',
          metadata: { targetUserId: 'missing-id' },
        }),
      );
      expect(rbacCacheService.hasPermission).not.toHaveBeenCalled();
    });

    it('allows self access without checking permissions', async () => {
      usersService.findById!.mockResolvedValue(targetUser);
      const { context, request } = buildContext(
        { userId: 'user-1' },
        { userId: 'user-1', email: currentUser.email },
      );

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(request.targetUser).toBe(targetUser);
      expect(request.profileAccessType).toBe('self');
      expect(rbacCacheService.hasPermission).not.toHaveBeenCalled();
    });

    it('allows access when the user holds the users:read permission', async () => {
      usersService.findById!.mockResolvedValue(targetUser);
      rbacCacheService.hasPermission!.mockReturnValue(true);
      const { context, request } = buildContext(
        { userId: 'user-2' },
        currentUser,
      );

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(rbacCacheService.hasPermission).toHaveBeenCalledWith(
        'user-1',
        'users',
        'read',
      );
      expect(request.targetUser).toBe(targetUser);
      expect(request.profileAccessType).toBe('permission');
    });

    it('throws ForbiddenException and records an audit event when the user lacks permission', async () => {
      usersService.findById!.mockResolvedValue(targetUser);
      rbacCacheService.hasPermission!.mockReturnValue(false);
      const { context } = buildContext({ userId: 'user-2' }, currentUser);

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );

      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'USER_PROFILE_ACCESS_DENIED',
          userId: 'user-1',
          metadata: { targetUserId: 'user-2' },
        }),
      );
    });

    it('reads the profile:access metadata from the handler and class', async () => {
      usersService.findById!.mockResolvedValue(targetUser);
      rbacCacheService.hasPermission!.mockReturnValue(true);
      const { context } = buildContext({ userId: 'user-2' }, currentUser);

      await guard.canActivate(context);

      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
        'profile:access',
        [context.getHandler(), context.getClass()],
      );
    });

    it('checks the update permission when the update metadata is set', async () => {
      reflector.getAllAndOverride!.mockReturnValue({
        permission: 'users',
        action: 'update',
      });
      usersService.findById!.mockResolvedValue(targetUser);
      rbacCacheService.hasPermission!.mockReturnValue(true);
      const { context, request } = buildContext(
        { userId: 'user-2' },
        currentUser,
      );

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(rbacCacheService.hasPermission).toHaveBeenCalledWith(
        'user-1',
        'users',
        'update',
      );
      expect(request.targetUser).toBe(targetUser);
      expect(request.profileAccessType).toBe('permission');
    });
  });
});
