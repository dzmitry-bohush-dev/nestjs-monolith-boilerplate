import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { RolesService } from './roles.service';
import { Role } from '../entities/role.entity';
import { RbacCacheService } from './rbac-cache.service';
import { AuditLogService } from '@/core/audit-log/audit-log.service';
import { AuditLog } from '@/core/audit-log/entities/audit-log.entity';

describe('RolesService', () => {
  let service: RolesService;
  let roleRepository: jest.Mocked<Repository<Role>>;
  let rbacCacheService: jest.Mocked<RbacCacheService>;
  let auditLogService: jest.Mocked<AuditLogService>;

  const mockUser = { userId: 'user-1', email: 'user@example.com' };
  const mockRole: Role = {
    id: 'role-1',
    name: 'admin',
    description: 'Admin role',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const mockAuditLog: AuditLog = {
    id: 'audit-1',
    eventType: 'RBAC_ROLE_CREATED',
    userId: 'user-1',
    email: null,
    ipAddress: null,
    userAgent: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        {
          provide: getRepositoryToken(Role),
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

    service = module.get<RolesService>(RolesService);
    const roleRepositoryToken = getRepositoryToken(Role);
    roleRepository =
      module.get<jest.Mocked<Repository<Role>>>(roleRepositoryToken);
    rbacCacheService =
      module.get<jest.Mocked<RbacCacheService>>(RbacCacheService);
    auditLogService = module.get<jest.Mocked<AuditLogService>>(AuditLogService);
  });

  describe('create', () => {
    it('should create a role and reload cache', async () => {
      const dto = { name: 'admin', description: 'Admin role' };
      roleRepository.findOne.mockResolvedValue(null);
      roleRepository.create.mockReturnValue(mockRole);
      roleRepository.save.mockResolvedValue(mockRole);
      rbacCacheService.reload.mockResolvedValue(void 0);
      auditLogService.record.mockResolvedValue(mockAuditLog);

      const result = await service.create(dto, mockUser);

      expect(result.name).toBe('admin');
      expect(rbacCacheService.reload.bind(rbacCacheService)).toHaveBeenCalled();
      expect(auditLogService.record.bind(auditLogService)).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'RBAC_ROLE_CREATED',
          userId: 'user-1',
        }),
      );
    });

    it('should throw ConflictException if role name already exists', async () => {
      const dto = { name: 'admin' };
      roleRepository.findOne.mockResolvedValue(mockRole);

      await expect(service.create(dto, mockUser)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('update', () => {
    it('should update a role and reload cache', async () => {
      const dto = { description: 'Updated admin role' };
      const updatedRole: Role = {
        ...mockRole,
        description: 'Updated admin role',
      };
      roleRepository.findOne.mockResolvedValue(mockRole);
      roleRepository.save.mockResolvedValue(updatedRole);
      rbacCacheService.reload.mockResolvedValue(void 0);
      auditLogService.record.mockResolvedValue(mockAuditLog);

      const result = await service.update('role-1', dto, mockUser);

      expect(result.description).toBe('Updated admin role');
      expect(rbacCacheService.reload.bind(rbacCacheService)).toHaveBeenCalled();
    });

    it('should throw NotFoundException if role does not exist', async () => {
      const dto = { name: 'new-name' };
      roleRepository.findOne.mockResolvedValue(null);

      await expect(service.update('role-1', dto, mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if new name already exists', async () => {
      const dto = { name: 'existing-name' };
      const existingRole: Role = {
        id: 'role-2',
        name: 'existing-name',
        description: undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      roleRepository.findOne
        .mockResolvedValueOnce(mockRole)
        .mockResolvedValueOnce(existingRole);

      await expect(service.update('role-1', dto, mockUser)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('delete', () => {
    it('should delete a role and reload cache', async () => {
      roleRepository.findOne.mockResolvedValue(mockRole);
      roleRepository.remove.mockResolvedValue(mockRole);
      rbacCacheService.reload.mockResolvedValue(void 0);
      auditLogService.record.mockResolvedValue(mockAuditLog);

      await service.delete('role-1', mockUser);

      expect(roleRepository.remove.bind(roleRepository)).toHaveBeenCalledWith(
        mockRole,
      );
      expect(rbacCacheService.reload.bind(rbacCacheService)).toHaveBeenCalled();
      expect(auditLogService.record.bind(auditLogService)).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'RBAC_ROLE_DELETED',
          userId: 'user-1',
        }),
      );
    });

    it('should throw NotFoundException if role does not exist', async () => {
      roleRepository.findOne.mockResolvedValue(null);

      await expect(service.delete('role-1', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('should return all roles', async () => {
      const roles = [mockRole];
      roleRepository.find.mockResolvedValue(roles);

      const result = await service.findAll();

      expect(result).toEqual(roles);
    });
  });

  describe('findById', () => {
    it('should return a role by id', async () => {
      roleRepository.findOne.mockResolvedValue(mockRole);

      const result = await service.findById('role-1');

      expect(result).toEqual(mockRole);
    });

    it('should return null if role does not exist', async () => {
      roleRepository.findOne.mockResolvedValue(null);

      const result = await service.findById('role-1');

      expect(result).toBeNull();
    });
  });
});
