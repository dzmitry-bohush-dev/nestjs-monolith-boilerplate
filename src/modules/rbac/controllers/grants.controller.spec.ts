import { Test, TestingModule } from '@nestjs/testing';
import { FastifyRequest } from 'fastify';

import { GrantsController } from '@/modules/rbac/controllers/grants.controller';
import { CreateGrantDto } from '@/modules/rbac/dtos/create-grant.dto';
import { UpdateGrantDto } from '@/modules/rbac/dtos/update-grant.dto';
import { Grant } from '@/modules/rbac/entities/grant.entity';
import { PermissionGuard } from '@/modules/rbac/guards/permission.guard';
import { GrantsService } from '@/modules/rbac/services/grants.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';

describe('GrantsController', () => {
  let controller: GrantsController;
  let grantsService: {
    findAll: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };

  const request = {} as FastifyRequest;
  const user: AuthenticatedUser = { userId: 'user-1', email: 'a@b.com' };
  const grant: Grant = {
    id: 'grant-1',
    roleId: 'role-1',
    permissionId: 'perm-1',
    actions: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GrantsController],
      providers: [
        {
          provide: GrantsService,
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

    controller = module.get<GrantsController>(GrantsController);
    grantsService = module.get(GrantsService);
  });

  describe('findAll', () => {
    it('delegates to GrantsService.findAll', async () => {
      grantsService.findAll.mockResolvedValue([grant]);

      const result = await controller.findAll();

      expect(grantsService.findAll).toHaveBeenCalled();
      expect(result).toEqual([grant]);
    });
  });

  describe('create', () => {
    it('delegates to GrantsService.create', async () => {
      const dto: CreateGrantDto = { roleId: 'role-1', permissionId: 'perm-1' };
      grantsService.create.mockResolvedValue(grant);

      const result = await controller.create(dto, user, request);

      expect(grantsService.create).toHaveBeenCalledWith(dto, user, request);
      expect(result).toBe(grant);
    });
  });

  describe('update', () => {
    it('delegates to GrantsService.update', async () => {
      const dto: UpdateGrantDto = { actions: ['read'] };
      grantsService.update.mockResolvedValue(grant);

      const result = await controller.update('grant-1', dto, user, request);

      expect(grantsService.update).toHaveBeenCalledWith(
        'grant-1',
        dto,
        user,
        request,
      );
      expect(result).toBe(grant);
    });
  });

  describe('delete', () => {
    it('delegates to GrantsService.delete', async () => {
      grantsService.delete.mockResolvedValue(undefined);

      await controller.delete('grant-1', user, request);

      expect(grantsService.delete).toHaveBeenCalledWith(
        'grant-1',
        user,
        request,
      );
    });
  });
});
