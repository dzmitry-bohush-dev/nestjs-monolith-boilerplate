jest.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { UserRolesService } from './user-roles.service';
import { UserRole } from '../entities/user-role.entity';
import { Role } from '../entities/role.entity';
import { RbacCacheService } from './rbac-cache.service';
import {
  AuditLogService,
  RecordAuditEventParams,
} from '@/core/audit-log/audit-log.service';
import { AuditLog } from '@/core/audit-log/entities/audit-log.entity';
import { UsersService } from '@/modules/users/services/users.service';
import { User } from '@/modules/users/entities/user.entity';
import { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';

describe('UserRolesService', () => {
  let service: UserRolesService;
  let userRoleRepository: Repository<UserRole>;
  let roleRepository: Repository<Role>;
  let usersService: UsersService;
  let rbacCacheService: RbacCacheService;
  let auditLogService: AuditLogService;

  const mockActor: AuthenticatedUser = {
    userId: 'actor-1',
    email: 'actor@example.com',
  };
  const mockUser: User = {
    id: 'user-1',
    email: 'user@example.com',
    passwordHash: 'hashed_password',
    photo: null,
    firstName: null,
    lastName: null,
    status: 'ACTIVE',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const mockRole: Role = {
    id: 'role-1',
    name: 'admin',
    description: 'Administrator role',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const mockUserRole: UserRole = {
    id: 'ur-1',
    userId: 'user-1',
    roleId: 'role-1',
    user: mockUser,
    role: mockRole,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const mockAuditLog: AuditLog = {
    id: 'audit-1',
    eventType: 'RBAC_USER_ROLE_ASSIGNED',
    userId: 'actor-1',
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
        UserRolesService,
        {
          provide: getRepositoryToken(UserRole),
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
          provide: UsersService,
          useValue: {
            findById: jest.fn(),
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

    service = module.get<UserRolesService>(UserRolesService);
    userRoleRepository = module.get<Repository<UserRole>>(
      getRepositoryToken(UserRole),
    );
    roleRepository = module.get<Repository<Role>>(getRepositoryToken(Role));
    usersService = module.get<UsersService>(UsersService);
    rbacCacheService = module.get<RbacCacheService>(RbacCacheService);
    auditLogService = module.get<AuditLogService>(AuditLogService);
  });

  describe('assignRole', () => {
    it('should assign a role to user and reload cache', async () => {
      const dto = { roleId: 'role-1' };
      jest.spyOn(usersService, 'findById').mockResolvedValue(mockUser);
      jest.spyOn(roleRepository, 'findOne').mockResolvedValue(mockRole);
      jest.spyOn(userRoleRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(userRoleRepository, 'create').mockReturnValue(mockUserRole);
      jest.spyOn(userRoleRepository, 'save').mockResolvedValue(mockUserRole);
      jest.spyOn(rbacCacheService, 'reload').mockResolvedValue(void 0);
      jest.spyOn(auditLogService, 'record').mockResolvedValue(mockAuditLog);

      const result = await service.assignRole('user-1', dto, mockActor);

      expect(result).toEqual(mockUserRole);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(rbacCacheService.reload).toHaveBeenCalled();

      const expectedAuditParams: Partial<RecordAuditEventParams> = {
        eventType: 'RBAC_USER_ROLE_ASSIGNED',
        userId: 'actor-1',
        metadata: {
          userRoleId: 'ur-1',
          targetUserId: 'user-1',
          roleId: 'role-1',
        },
      };
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining(expectedAuditParams),
      );
    });

    it('should throw NotFoundException if user does not exist', async () => {
      const dto = { roleId: 'role-1' };
      jest.spyOn(usersService, 'findById').mockResolvedValue(null);

      await expect(
        service.assignRole('user-1', dto, mockActor),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if role does not exist', async () => {
      const dto = { roleId: 'role-1' };
      jest.spyOn(usersService, 'findById').mockResolvedValue(mockUser);
      jest.spyOn(roleRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.assignRole('user-1', dto, mockActor),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if user already has role', async () => {
      const dto = { roleId: 'role-1' };
      jest.spyOn(usersService, 'findById').mockResolvedValue(mockUser);
      jest.spyOn(roleRepository, 'findOne').mockResolvedValue(mockRole);
      jest.spyOn(userRoleRepository, 'findOne').mockResolvedValue(mockUserRole);

      await expect(
        service.assignRole('user-1', dto, mockActor),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('revokeRole', () => {
    it('should revoke a role from user and reload cache', async () => {
      jest.spyOn(userRoleRepository, 'findOne').mockResolvedValue(mockUserRole);

      jest.spyOn(userRoleRepository, 'remove').mockResolvedValue(mockUserRole);
      jest.spyOn(rbacCacheService, 'reload').mockResolvedValue(void 0);
      jest.spyOn(auditLogService, 'record').mockResolvedValue(mockAuditLog);

      await service.revokeRole('user-1', 'role-1', mockActor);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(userRoleRepository.remove).toHaveBeenCalledWith(mockUserRole);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(rbacCacheService.reload).toHaveBeenCalled();

      const expectedRevokeAuditParams: Partial<RecordAuditEventParams> = {
        eventType: 'RBAC_USER_ROLE_REVOKED',
        userId: 'actor-1',
        metadata: {
          userRoleId: 'ur-1',
          targetUserId: 'user-1',
          roleId: 'role-1',
        },
      };
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining(expectedRevokeAuditParams),
      );
    });

    it('should throw NotFoundException if user role does not exist', async () => {
      jest.spyOn(userRoleRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.revokeRole('user-1', 'role-1', mockActor),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findRolesForUser', () => {
    it('should return all roles for a user', async () => {
      const userRoles: UserRole[] = [mockUserRole];
      jest.spyOn(userRoleRepository, 'find').mockResolvedValue(userRoles);

      const result = await service.findRolesForUser('user-1');

      expect(result).toEqual([mockRole]);
    });

    it('should return empty array if user has no roles', async () => {
      jest.spyOn(userRoleRepository, 'find').mockResolvedValue([]);

      const result = await service.findRolesForUser('user-1');

      expect(result).toEqual([]);
    });
  });
});
