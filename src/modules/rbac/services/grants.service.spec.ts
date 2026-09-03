jest.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { Repository } from 'typeorm';
import { GrantsService } from './grants.service';
import { Grant } from '../entities/grant.entity';
import { Role } from '../entities/role.entity';
import { Permission } from '../entities/permission.entity';
import { RbacCacheService } from './rbac-cache.service';
import { AuditLogService } from '@/core/audit-log/audit-log.service';
import type { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';
import type { AuditLog } from '@/core/audit-log/entities/audit-log.entity';

describe('GrantsService', () => {
  let service: GrantsService;
  let grantRepository: Repository<Grant>;
  let roleRepository: Repository<Role>;
  let permissionRepository: Repository<Permission>;
  let rbacCacheService: RbacCacheService;
  let auditLogService: AuditLogService;

  const mockUser: AuthenticatedUser = {
    userId: 'user-1',
    email: 'user@example.com',
  } as AuthenticatedUser;
  const mockRole: Partial<Role> = {
    id: 'role-1',
    name: 'admin',
  };
  const mockPermission: Partial<Permission> = {
    id: 'perm-1',
    name: 'posts',
    actions: ['create', 'read', 'update', 'delete'],
  };
  const mockGrant: Partial<Grant> = {
    id: 'grant-1',
    roleId: 'role-1',
    permissionId: 'perm-1',
    actions: ['create', 'read'],
    role: mockRole as Role,
    permission: mockPermission as Permission,
  };
  const mockAuditLog: Partial<AuditLog> = {
    id: 'audit-1',
    eventType: 'RBAC_GRANT_CREATED',
    userId: 'user-1',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GrantsService,
        {
          provide: getRepositoryToken(Grant),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Role),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Permission),
          useValue: {
            findOne: jest.fn(),
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

    service = module.get<GrantsService>(GrantsService);
    grantRepository = module.get<Repository<Grant>>(getRepositoryToken(Grant));
    roleRepository = module.get<Repository<Role>>(getRepositoryToken(Role));
    permissionRepository = module.get<Repository<Permission>>(
      getRepositoryToken(Permission),
    );
    rbacCacheService = module.get<RbacCacheService>(RbacCacheService);
    auditLogService = module.get<AuditLogService>(AuditLogService);
  });

  describe('create', () => {
    it('should create a grant and reload cache', async () => {
      const dto = {
        roleId: 'role-1',
        permissionId: 'perm-1',
        actions: ['create'],
      };
      jest
        .spyOn(roleRepository, 'findOne')
        .mockResolvedValue(mockRole as unknown as Role);
      jest
        .spyOn(permissionRepository, 'findOne')
        .mockResolvedValue(mockPermission as unknown as Permission);
      jest.spyOn(grantRepository, 'findOne').mockResolvedValue(null);
      jest
        .spyOn(grantRepository, 'create')
        .mockReturnValue(mockGrant as unknown as Grant);
      jest
        .spyOn(grantRepository, 'save')
        .mockResolvedValue(mockGrant as unknown as Grant);
      const reloadSpy = jest
        .spyOn(rbacCacheService, 'reload')
        .mockResolvedValue(undefined);
      jest
        .spyOn(auditLogService, 'record')
        .mockResolvedValue(mockAuditLog as unknown as AuditLog);

      const result = await service.create(dto, mockUser);

      expect(result).toEqual(mockGrant);
      expect(reloadSpy).toHaveBeenCalled();
    });

    it('should throw NotFoundException if role does not exist', async () => {
      const dto = { roleId: 'role-1', permissionId: 'perm-1', actions: [] };
      jest.spyOn(roleRepository, 'findOne').mockResolvedValue(null);

      await expect(service.create(dto, mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if permission does not exist', async () => {
      const dto = { roleId: 'role-1', permissionId: 'perm-1', actions: [] };
      jest
        .spyOn(roleRepository, 'findOne')
        .mockResolvedValue(mockRole as unknown as Role);
      jest.spyOn(permissionRepository, 'findOne').mockResolvedValue(null);

      await expect(service.create(dto, mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if grant already exists', async () => {
      const dto = { roleId: 'role-1', permissionId: 'perm-1', actions: [] };
      jest
        .spyOn(roleRepository, 'findOne')
        .mockResolvedValue(mockRole as unknown as Role);
      jest
        .spyOn(permissionRepository, 'findOne')
        .mockResolvedValue(mockPermission as unknown as Permission);
      jest
        .spyOn(grantRepository, 'findOne')
        .mockResolvedValue(mockGrant as unknown as Grant);

      await expect(service.create(dto, mockUser)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw BadRequestException if actions not in permission', async () => {
      const dto = {
        roleId: 'role-1',
        permissionId: 'perm-1',
        actions: ['invalid-action'],
      };
      jest
        .spyOn(roleRepository, 'findOne')
        .mockResolvedValue(mockRole as unknown as Role);
      jest
        .spyOn(permissionRepository, 'findOne')
        .mockResolvedValue(mockPermission as unknown as Permission);
      jest.spyOn(grantRepository, 'findOne').mockResolvedValue(null);

      await expect(service.create(dto, mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('update', () => {
    it('should update grant actions and reload cache', async () => {
      const dto = { actions: ['read'] };
      jest
        .spyOn(grantRepository, 'findOne')
        .mockResolvedValue(mockGrant as unknown as Grant);
      jest.spyOn(grantRepository, 'save').mockResolvedValue({
        ...mockGrant,
        actions: ['read'],
      } as unknown as Grant);
      const reloadSpy = jest
        .spyOn(rbacCacheService, 'reload')
        .mockResolvedValue(undefined);
      jest
        .spyOn(auditLogService, 'record')
        .mockResolvedValue(mockAuditLog as unknown as AuditLog);

      const result = await service.update('grant-1', dto, mockUser);

      expect(result.actions).toEqual(['read']);
      expect(reloadSpy).toHaveBeenCalled();
    });

    it('should throw NotFoundException if grant does not exist', async () => {
      const dto = { actions: ['read'] };
      jest.spyOn(grantRepository, 'findOne').mockResolvedValue(null);

      await expect(service.update('grant-1', dto, mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if new actions invalid', async () => {
      const dto = { actions: ['invalid'] };
      jest
        .spyOn(grantRepository, 'findOne')
        .mockResolvedValue(mockGrant as unknown as Grant);

      await expect(service.update('grant-1', dto, mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('delete', () => {
    it('should delete a grant and reload cache', async () => {
      jest
        .spyOn(grantRepository, 'findOne')
        .mockResolvedValue(mockGrant as unknown as Grant);
      const removeSpy = jest
        .spyOn(grantRepository, 'remove')
        .mockResolvedValue(mockGrant as unknown as Grant);
      const reloadSpy = jest
        .spyOn(rbacCacheService, 'reload')
        .mockResolvedValue(undefined);
      jest
        .spyOn(auditLogService, 'record')
        .mockResolvedValue(mockAuditLog as unknown as AuditLog);

      await service.delete('grant-1', mockUser);

      expect(removeSpy).toHaveBeenCalledWith(mockGrant);
      expect(reloadSpy).toHaveBeenCalled();
    });

    it('should throw NotFoundException if grant does not exist', async () => {
      jest.spyOn(grantRepository, 'findOne').mockResolvedValue(null);

      await expect(service.delete('grant-1', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('should return all grants with relations', async () => {
      const grants = [mockGrant as unknown as Grant];
      jest.spyOn(grantRepository, 'find').mockResolvedValue(grants);

      const result = await service.findAll();

      expect(result).toEqual(grants);
    });
  });

  describe('findById', () => {
    it('should return a grant by id', async () => {
      jest
        .spyOn(grantRepository, 'findOne')
        .mockResolvedValue(mockGrant as unknown as Grant);

      const result = await service.findById('grant-1');

      expect(result).toEqual(mockGrant);
    });

    it('should return null if grant does not exist', async () => {
      jest.spyOn(grantRepository, 'findOne').mockResolvedValue(null);

      const result = await service.findById('grant-1');

      expect(result).toBeNull();
    });
  });
});
