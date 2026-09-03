jest.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { PermissionsService } from './permissions.service';
import { Permission } from '../entities/permission.entity';
import { RbacCacheService } from './rbac-cache.service';
import { AuditLogService } from '@/core/audit-log/audit-log.service';
import { AuditLog } from '@/core/audit-log/entities/audit-log.entity';
import { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';

describe('PermissionsService', () => {
  let service: PermissionsService;
  let permissionRepository: Repository<Permission>;
  let rbacCacheService: RbacCacheService;
  let auditLogService: AuditLogService;

  const mockUser: AuthenticatedUser = {
    userId: 'user-1',
    email: 'user@example.com',
  };
  const mockPermission: Permission = {
    id: 'perm-1',
    name: 'posts',
    actions: ['create', 'read', 'update', 'delete'],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const mockAuditLog: AuditLog = {
    id: 'log-1',
    eventType: 'RBAC_PERMISSION_CREATED',
    userId: 'user-1',
    email: 'user@example.com',
    ipAddress: null,
    userAgent: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        {
          provide: getRepositoryToken(Permission),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: RbacCacheService,
          useValue: { reload: jest.fn() },
        },
        {
          provide: AuditLogService,
          useValue: { record: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<PermissionsService>(PermissionsService);
    permissionRepository = module.get<Repository<Permission>>(
      getRepositoryToken(Permission),
    );
    rbacCacheService = module.get<RbacCacheService>(RbacCacheService);
    auditLogService = module.get<AuditLogService>(AuditLogService);
  });

  describe('create', () => {
    it('should create a permission and reload cache', async () => {
      const dto = { name: 'posts', actions: ['create', 'read'] };
      jest.spyOn(permissionRepository, 'findOne').mockResolvedValue(null);
      jest
        .spyOn(permissionRepository, 'create')
        .mockReturnValue(mockPermission);
      jest
        .spyOn(permissionRepository, 'save')
        .mockResolvedValue(mockPermission);
      const reloadSpy = jest
        .spyOn(rbacCacheService, 'reload')
        .mockResolvedValue(undefined);
      const recordSpy = jest
        .spyOn(auditLogService, 'record')
        .mockResolvedValue(mockAuditLog);

      const result = await service.create(dto, mockUser);

      expect(result.name).toBe('posts');
      expect(reloadSpy).toHaveBeenCalled();
      expect(recordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'RBAC_PERMISSION_CREATED',
          userId: 'user-1',
        }),
      );
    });

    it('should throw ConflictException if permission name already exists', async () => {
      const dto = { name: 'posts', actions: ['create'] };
      jest
        .spyOn(permissionRepository, 'findOne')
        .mockResolvedValue(mockPermission);

      await expect(service.create(dto, mockUser)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('update', () => {
    it('should update a permission and reload cache', async () => {
      const dto = { actions: ['read', 'write'] };
      jest
        .spyOn(permissionRepository, 'findOne')
        .mockResolvedValue(mockPermission);
      jest.spyOn(permissionRepository, 'save').mockResolvedValue({
        ...mockPermission,
        actions: ['read', 'write'],
      });
      const reloadSpy = jest
        .spyOn(rbacCacheService, 'reload')
        .mockResolvedValue(undefined);
      jest.spyOn(auditLogService, 'record').mockResolvedValue(mockAuditLog);

      const result = await service.update('perm-1', dto, mockUser);

      expect(result.actions).toEqual(['read', 'write']);
      expect(reloadSpy).toHaveBeenCalled();
    });

    it('should throw NotFoundException if permission does not exist', async () => {
      const dto = { name: 'new-name' };
      jest.spyOn(permissionRepository, 'findOne').mockResolvedValue(null);

      await expect(service.update('perm-1', dto, mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if new name already exists', async () => {
      const dto = { name: 'existing-name' };
      jest
        .spyOn(permissionRepository, 'findOne')
        .mockResolvedValueOnce(mockPermission);
      const existingPermission: Permission = {
        id: 'perm-2',
        name: 'existing-name',
        actions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      jest
        .spyOn(permissionRepository, 'findOne')
        .mockResolvedValueOnce(existingPermission);

      await expect(service.update('perm-1', dto, mockUser)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('delete', () => {
    it('should delete a permission and reload cache', async () => {
      jest
        .spyOn(permissionRepository, 'findOne')
        .mockResolvedValue(mockPermission);
      const removeSpy = jest
        .spyOn(permissionRepository, 'remove')
        .mockResolvedValue(mockPermission);
      const reloadSpy = jest
        .spyOn(rbacCacheService, 'reload')
        .mockResolvedValue(undefined);
      const recordSpy = jest
        .spyOn(auditLogService, 'record')
        .mockResolvedValue(mockAuditLog);

      await service.delete('perm-1', mockUser);

      expect(removeSpy).toHaveBeenCalledWith(mockPermission);
      expect(reloadSpy).toHaveBeenCalled();
      expect(recordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'RBAC_PERMISSION_DELETED',
          userId: 'user-1',
        }),
      );
    });

    it('should throw NotFoundException if permission does not exist', async () => {
      jest.spyOn(permissionRepository, 'findOne').mockResolvedValue(null);

      await expect(service.delete('perm-1', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('should return all permissions', async () => {
      const permissions: Permission[] = [mockPermission];
      jest.spyOn(permissionRepository, 'find').mockResolvedValue(permissions);

      const result = await service.findAll();

      expect(result).toEqual(permissions);
    });
  });

  describe('findById', () => {
    it('should return a permission by id', async () => {
      jest
        .spyOn(permissionRepository, 'findOne')
        .mockResolvedValue(mockPermission);

      const result = await service.findById('perm-1');

      expect(result).toEqual(mockPermission);
    });

    it('should return null if permission does not exist', async () => {
      jest.spyOn(permissionRepository, 'findOne').mockResolvedValue(null);

      const result = await service.findById('perm-1');

      expect(result).toBeNull();
    });
  });
});
