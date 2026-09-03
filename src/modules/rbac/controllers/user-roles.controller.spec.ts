import { Test, TestingModule } from '@nestjs/testing';
import { FastifyRequest } from 'fastify';

import { UserRolesController } from '@/modules/rbac/controllers/user-roles.controller';
import { AssignRoleDto } from '@/modules/rbac/dtos/assign-role.dto';
import { Role } from '@/modules/rbac/entities/role.entity';
import { UserRole } from '@/modules/rbac/entities/user-role.entity';
import { PermissionGuard } from '@/modules/rbac/guards/permission.guard';
import { UserRolesService } from '@/modules/rbac/services/user-roles.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';

describe('UserRolesController', () => {
  let controller: UserRolesController;
  let userRolesService: {
    findRolesForUser: jest.Mock;
    assignRole: jest.Mock;
    revokeRole: jest.Mock;
  };

  const request = {} as FastifyRequest;
  const actor: AuthenticatedUser = { userId: 'actor-1', email: 'a@b.com' };
  const role: Role = {
    id: 'role-1',
    name: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const userRole: UserRole = {
    id: 'ur-1',
    userId: 'target-1',
    roleId: 'role-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserRolesController],
      providers: [
        {
          provide: UserRolesService,
          useValue: {
            findRolesForUser: jest.fn(),
            assignRole: jest.fn(),
            revokeRole: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UserRolesController>(UserRolesController);
    userRolesService = module.get(UserRolesService);
  });

  describe('findRolesForUser', () => {
    it('delegates to UserRolesService.findRolesForUser', async () => {
      userRolesService.findRolesForUser.mockResolvedValue([role]);

      const result = await controller.findRolesForUser('target-1');

      expect(userRolesService.findRolesForUser).toHaveBeenCalledWith(
        'target-1',
      );
      expect(result).toEqual([role]);
    });
  });

  describe('assignRole', () => {
    it('delegates to UserRolesService.assignRole', async () => {
      const dto: AssignRoleDto = { roleId: 'role-1' };
      userRolesService.assignRole.mockResolvedValue(userRole);

      const result = await controller.assignRole(
        'target-1',
        dto,
        actor,
        request,
      );

      expect(userRolesService.assignRole).toHaveBeenCalledWith(
        'target-1',
        dto,
        actor,
        request,
      );
      expect(result).toBe(userRole);
    });
  });

  describe('revokeRole', () => {
    it('delegates to UserRolesService.revokeRole', async () => {
      userRolesService.revokeRole.mockResolvedValue(undefined);

      await controller.revokeRole('target-1', 'role-1', actor, request);

      expect(userRolesService.revokeRole).toHaveBeenCalledWith(
        'target-1',
        'role-1',
        actor,
        request,
      );
    });
  });
});
