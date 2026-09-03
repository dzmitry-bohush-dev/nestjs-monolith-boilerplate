import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RbacCacheService } from './rbac-cache.service';
import { Grant } from '../entities/grant.entity';
import { UserRole } from '../entities/user-role.entity';
import { AuditLogService } from '@/core/audit-log/audit-log.service';

describe('RbacCacheService', () => {
  let service: RbacCacheService;
  let grantRepository: Repository<Grant>;
  let userRoleRepository: Repository<UserRole>;
  let auditLogService: AuditLogService;

  const createMockRepository = () => ({
    find: jest.fn(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbacCacheService,
        {
          provide: getRepositoryToken(Grant),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(UserRole),
          useValue: createMockRepository(),
        },
        {
          provide: AuditLogService,
          useValue: { record: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<RbacCacheService>(RbacCacheService);
    grantRepository = module.get<Repository<Grant>>(getRepositoryToken(Grant));
    userRoleRepository = module.get<Repository<UserRole>>(
      getRepositoryToken(UserRole),
    );
    auditLogService = module.get<AuditLogService>(AuditLogService);
  });

  describe('reload', () => {
    it('should build cache from grants and user-roles', async () => {
      const mockGrants = [
        {
          id: 'grant-1',
          roleId: 'role-1',
          permissionId: 'perm-1',
          actions: ['create', 'read'],
          permission: {
            id: 'perm-1',
            name: 'posts',
            actions: ['create', 'read', 'update', 'delete'],
          },
        },
        {
          id: 'grant-2',
          roleId: 'role-1',
          permissionId: 'perm-2',
          actions: null,
          permission: { id: 'perm-2', name: 'users', actions: ['read'] },
        },
      ];

      const mockUserRoles = [
        { id: 'ur-1', userId: 'user-1', roleId: 'role-1' },
        { id: 'ur-2', userId: 'user-2', roleId: 'role-1' },
      ];

      jest
        .spyOn(grantRepository, 'find')
        .mockResolvedValue(mockGrants as unknown as Grant[]);

      jest
        .spyOn(userRoleRepository, 'find')
        .mockResolvedValue(mockUserRoles as unknown as UserRole[]);

      await service.reload();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'RBAC_CACHE_RELOADED',
          userId: undefined,
          metadata: { grantCount: 2, userRoleCount: 2 },
        }),
      );
    });

    it('should handle null/empty actions as ALL permission', async () => {
      const mockGrants = [
        {
          id: 'grant-1',
          roleId: 'role-1',
          permissionId: 'perm-1',
          actions: null,
          permission: {
            name: 'admin',
            actions: ['create', 'read', 'update', 'delete'],
          },
        },
      ];

      jest
        .spyOn(grantRepository, 'find')
        .mockResolvedValue(mockGrants as unknown as Grant[]);
      jest.spyOn(userRoleRepository, 'find').mockResolvedValue([]);

      await service.reload();

      expect(service.hasPermission('any-user', 'admin', 'create')).toBe(false);
    });

    it('should filter grant actions to only valid permission actions', async () => {
      const mockGrants = [
        {
          id: 'grant-1',
          roleId: 'role-1',
          permissionId: 'perm-1',
          actions: ['create', 'invalid-action'],
          permission: { name: 'posts', actions: ['create', 'read'] },
        },
      ];

      jest
        .spyOn(grantRepository, 'find')
        .mockResolvedValue(mockGrants as unknown as Grant[]);

      jest
        .spyOn(userRoleRepository, 'find')
        .mockResolvedValue([
          { userId: 'user-1', roleId: 'role-1' } as unknown as UserRole,
        ]);

      await service.reload();

      expect(service.hasPermission('user-1', 'posts', 'create')).toBe(true);
      expect(service.hasPermission('user-1', 'posts', 'invalid-action')).toBe(
        false,
      );
    });
  });

  describe('hasPermission', () => {
    beforeEach(async () => {
      const mockGrants = [
        {
          roleId: 'role-admin',
          permissionId: 'perm-1',
          actions: null,
          permission: {
            name: 'admin',
            actions: ['create', 'read', 'update', 'delete'],
          },
        },
        {
          roleId: 'role-user',
          permissionId: 'perm-1',
          actions: ['read'],
          permission: {
            name: 'admin',
            actions: ['create', 'read', 'update', 'delete'],
          },
        },
        {
          roleId: 'role-user',
          permissionId: 'perm-2',
          actions: ['create', 'read'],
          permission: {
            name: 'posts',
            actions: ['create', 'read', 'update', 'delete'],
          },
        },
      ];

      jest
        .spyOn(grantRepository, 'find')
        .mockResolvedValue(mockGrants as unknown as Grant[]);

      jest
        .spyOn(userRoleRepository, 'find')
        .mockResolvedValue([
          { userId: 'admin-1', roleId: 'role-admin' } as unknown as UserRole,
          { userId: 'user-1', roleId: 'role-user' } as unknown as UserRole,
        ]);

      await service.reload();
    });

    it('should return false if user has no roles', () => {
      expect(service.hasPermission('unknown-user', 'admin', 'create')).toBe(
        false,
      );
    });

    it('should return true for ALL permission grant', () => {
      expect(service.hasPermission('admin-1', 'admin', 'create')).toBe(true);
      expect(service.hasPermission('admin-1', 'admin', 'delete')).toBe(true);
    });

    it('should return true for matching subset action grant', () => {
      expect(service.hasPermission('user-1', 'admin', 'read')).toBe(true);
      expect(service.hasPermission('user-1', 'posts', 'create')).toBe(true);
    });

    it('should return false for non-matching subset action grant', () => {
      expect(service.hasPermission('user-1', 'admin', 'create')).toBe(false);
      expect(service.hasPermission('user-1', 'posts', 'delete')).toBe(false);
    });

    it('should return false for permission user does not have', () => {
      expect(service.hasPermission('user-1', 'unknown-perm', 'read')).toBe(
        false,
      );
    });

    it('should support multiple roles (union)', async () => {
      jest.spyOn(grantRepository, 'find').mockResolvedValue([
        {
          roleId: 'role-1',
          permissionId: 'perm-1',
          actions: ['read'],
          permission: { name: 'posts', actions: ['read'] },
        },
        {
          roleId: 'role-2',
          permissionId: 'perm-1',
          actions: ['write'],
          permission: { name: 'posts', actions: ['write'] },
        },
      ] as unknown as Grant[]);

      jest.spyOn(userRoleRepository, 'find').mockResolvedValue([
        {
          userId: 'user-multi',
          roleId: 'role-1',
        } as unknown as UserRole,
        {
          userId: 'user-multi',
          roleId: 'role-2',
        } as unknown as UserRole,
      ]);

      await service.reload();

      expect(service.hasPermission('user-multi', 'posts', 'read')).toBe(true);
      expect(service.hasPermission('user-multi', 'posts', 'write')).toBe(true);
    });
  });

  describe('reload failure', () => {
    it('should keep serving old cache if reload fails', async () => {
      const mockGrants = [
        {
          roleId: 'role-1',
          permissionId: 'perm-1',
          actions: ['read'],
          permission: { name: 'posts', actions: ['read'] },
        },
      ];

      jest
        .spyOn(grantRepository, 'find')
        .mockResolvedValue(mockGrants as unknown as Grant[]);
      jest
        .spyOn(userRoleRepository, 'find')
        .mockResolvedValue([
          { userId: 'user-1', roleId: 'role-1' } as unknown as UserRole,
        ]);

      await service.reload();
      expect(service.hasPermission('user-1', 'posts', 'read')).toBe(true);

      jest
        .spyOn(grantRepository, 'find')
        .mockRejectedValue(new Error('DB error'));
      jest.spyOn(auditLogService, 'record').mockClear();

      await expect(service.reload()).rejects.toThrow('DB error');

      expect(service.hasPermission('user-1', 'posts', 'read')).toBe(true);
    });
  });
});
