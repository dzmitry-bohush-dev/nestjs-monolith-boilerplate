import { Test, TestingModule } from '@nestjs/testing';
import { FastifyRequest } from 'fastify';

import { RolesController } from '@/modules/rbac/controllers/roles.controller';
import { CreateRoleDto } from '@/modules/rbac/dtos/create-role.dto';
import { UpdateRoleDto } from '@/modules/rbac/dtos/update-role.dto';
import { Role } from '@/modules/rbac/entities/role.entity';
import { PermissionGuard } from '@/modules/rbac/guards/permission.guard';
import { RolesService } from '@/modules/rbac/services/roles.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';

describe('RolesController', () => {
  let controller: RolesController;
  let rolesService: {
    findAll: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };

  const request = {} as FastifyRequest;
  const user: AuthenticatedUser = { userId: 'user-1', email: 'a@b.com' };
  const role: Role = {
    id: 'role-1',
    name: 'admin',
    description: 'Administrator',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RolesController],
      providers: [
        {
          provide: RolesService,
          useValue: {
            findAll: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RolesController>(RolesController);
    rolesService = module.get(RolesService);
  });

  describe('findAll', () => {
    it('delegates to RolesService.findAll', async () => {
      rolesService.findAll.mockResolvedValue([role]);

      const result = await controller.findAll();

      expect(rolesService.findAll).toHaveBeenCalled();
      expect(result).toEqual([role]);
    });
  });

  describe('create', () => {
    it('delegates to RolesService.create', async () => {
      const dto: CreateRoleDto = { name: 'admin' };
      rolesService.create.mockResolvedValue(role);

      const result = await controller.create(dto, user, request);

      expect(rolesService.create).toHaveBeenCalledWith(dto, user, request);
      expect(result).toBe(role);
    });
  });

  describe('update', () => {
    it('delegates to RolesService.update', async () => {
      const dto: UpdateRoleDto = { name: 'admin-updated' };
      rolesService.update.mockResolvedValue(role);

      const result = await controller.update('role-1', dto, user, request);

      expect(rolesService.update).toHaveBeenCalledWith(
        'role-1',
        dto,
        user,
        request,
      );
      expect(result).toBe(role);
    });
  });

  describe('delete', () => {
    it('delegates to RolesService.delete', async () => {
      rolesService.delete.mockResolvedValue(undefined);

      await controller.delete('role-1', user, request);

      expect(rolesService.delete).toHaveBeenCalledWith('role-1', user, request);
    });
  });
});
