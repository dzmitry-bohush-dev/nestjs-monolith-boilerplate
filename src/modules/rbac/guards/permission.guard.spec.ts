import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';
import { PermissionGuard } from './permission.guard';
import { RbacCacheService } from '../services/rbac-cache.service';
import { AuditLogService } from '@/core/audit-log/audit-log.service';
import { AuditLog } from '@/core/audit-log/entities/audit-log.entity';

describe('PermissionGuard', () => {
  let guard: PermissionGuard;
  let reflector: Partial<jest.Mocked<Reflector>>;
  let rbacCacheService: Partial<jest.Mocked<RbacCacheService>>;
  let auditLogService: Partial<jest.Mocked<AuditLogService>>;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };

    rbacCacheService = {
      hasPermission: jest.fn(),
    };

    auditLogService = {
      record: jest.fn(),
    };

    guard = new PermissionGuard(
      reflector as unknown as Reflector,
      rbacCacheService as unknown as RbacCacheService,
      auditLogService as unknown as AuditLogService,
    );
  });

  describe('canActivate', () => {
    let mockContext: Partial<jest.Mocked<ExecutionContext>>;
    let mockUser: AuthenticatedUser;

    beforeEach(() => {
      mockUser = { userId: 'user-1', email: 'user@example.com' };
      mockContext = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            user: mockUser,
          }),
        }),
      };
    });

    it('should return true if no metadata is present', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null);

      const result = await guard.canActivate(
        mockContext as unknown as ExecutionContext,
      );

      expect(result).toBe(true);
    });

    it('should throw ForbiddenException if no user is authenticated', async () => {
      const contextNoUser = {
        ...mockContext,
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            user: undefined,
          }),
        }),
      } as unknown as ExecutionContext;

      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue({ permission: 'rbac', action: 'read' });

      await expect(guard.canActivate(contextNoUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return true if user has permission', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
        permission: 'rbac',
        action: 'read',
      });
      jest.spyOn(rbacCacheService, 'hasPermission').mockReturnValue(true);

      const result = await guard.canActivate(
        mockContext as unknown as ExecutionContext,
      );

      expect(result).toBe(true);
      expect(rbacCacheService.hasPermission).toHaveBeenCalledWith(
        'user-1',
        'rbac',
        'read',
      );
    });

    it('should throw ForbiddenException and log if user lacks permission', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
        permission: 'rbac',
        action: 'delete',
      });
      jest.spyOn(rbacCacheService, 'hasPermission').mockReturnValue(false);

      const mockAuditLog = Object.assign(new AuditLog(), {
        id: 'log-1',
        eventType: 'RBAC_ACCESS_DENIED',
        userId: 'user-1',
        email: null,
        ipAddress: null,
        userAgent: null,
        metadata: { permission: 'rbac', action: 'delete' },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      jest.spyOn(auditLogService, 'record').mockResolvedValue(mockAuditLog);

      await expect(
        guard.canActivate(mockContext as unknown as ExecutionContext),
      ).rejects.toThrow(ForbiddenException);

      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'RBAC_ACCESS_DENIED',
          userId: 'user-1',
          metadata: {
            permission: 'rbac',
            action: 'delete',
          },
        }),
      );
    });
  });
});
