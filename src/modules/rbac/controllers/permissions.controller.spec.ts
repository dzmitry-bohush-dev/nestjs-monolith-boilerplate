import { Test, TestingModule } from '@nestjs/testing';
import { FastifyRequest } from 'fastify';

import { PermissionsController } from '@/modules/rbac/controllers/permissions.controller';
import { CreatePermissionDto } from '@/modules/rbac/dtos/create-permission.dto';
import { UpdatePermissionDto } from '@/modules/rbac/dtos/update-permission.dto';
import { Permission } from '@/modules/rbac/entities/permission.entity';
import { PermissionGuard } from '@/modules/rbac/guards/permission.guard';
import { PermissionsService } from '@/modules/rbac/services/permissions.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';

describe('PermissionsController', () => {
  let controller: PermissionsController;
  let permissionsService: {
    findAll: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };

  const request = {} as FastifyRequest;
  const user: AuthenticatedUser = { userId: 'user-1', email: 'a@b.com' };
  const permission: Permission = {
    id: 'perm-1',
    name: 'posts',
    actions: ['create', 'read'],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PermissionsController],
      providers: [
        {
          provide: PermissionsService,
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

    controller = module.get<PermissionsController>(PermissionsController);
    permissionsService = module.get(PermissionsService);
  });

  describe('findAll', () => {
    it('delegates to PermissionsService.findAll', async () => {
      permissionsService.findAll.mockResolvedValue([permission]);

      const result = await controller.findAll();

      expect(permissionsService.findAll).toHaveBeenCalled();
      expect(result).toEqual([permission]);
    });
  });

  describe('create', () => {
    it('delegates to PermissionsService.create', async () => {
      const dto: CreatePermissionDto = { name: 'posts', actions: ['create'] };
      permissionsService.create.mockResolvedValue(permission);

      const result = await controller.create(dto, user, request);

      expect(permissionsService.create).toHaveBeenCalledWith(
        dto,
        user,
        request,
      );
      expect(result).toBe(permission);
    });
  });

  describe('update', () => {
    it('delegates to PermissionsService.update', async () => {
      const dto: UpdatePermissionDto = { actions: ['create', 'update'] };
      permissionsService.update.mockResolvedValue(permission);

      const result = await controller.update('perm-1', dto, user, request);

      expect(permissionsService.update).toHaveBeenCalledWith(
        'perm-1',
        dto,
        user,
        request,
      );
      expect(result).toBe(permission);
    });
  });

  describe('delete', () => {
    it('delegates to PermissionsService.delete', async () => {
      permissionsService.delete.mockResolvedValue(undefined);

      await controller.delete('perm-1', user, request);

      expect(permissionsService.delete).toHaveBeenCalledWith(
        'perm-1',
        user,
        request,
      );
    });
  });
});
