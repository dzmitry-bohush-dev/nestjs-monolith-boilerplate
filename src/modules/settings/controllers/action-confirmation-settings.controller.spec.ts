import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyRequest } from 'fastify';

import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';
import { PermissionGuard } from '@/modules/rbac/guards/permission.guard';
import { ActionConfirmationSettingsController } from '@/modules/settings/controllers/action-confirmation-settings.controller';
import { UpdateActionConfirmationSettingDto } from '@/modules/settings/dtos/update-action-confirmation-setting.dto';
import { ActionConfirmationSetting } from '@/modules/settings/entities/action-confirmation-setting.entity';
import { ActionConfirmationSettingsService } from '@/modules/settings/services/action-confirmation-settings.service';

describe('ActionConfirmationSettingsController', () => {
  let controller: ActionConfirmationSettingsController;
  let service: {
    findAll: jest.Mock;
    findByAction: jest.Mock;
    upsert: jest.Mock;
  };

  const request = {} as FastifyRequest;
  const user: AuthenticatedUser = {
    userId: 'admin-1',
    email: 'admin@example.com',
  };
  const setting: ActionConfirmationSetting = {
    id: 'setting-1',
    action: 'auth.login',
    enabled: false,
    confirmationMethod: 'otp',
    updatedByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ActionConfirmationSettingsController],
      providers: [
        {
          provide: ActionConfirmationSettingsService,
          useValue: {
            findAll: jest.fn(),
            findByAction: jest.fn(),
            upsert: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ActionConfirmationSettingsController>(
      ActionConfirmationSettingsController,
    );
    service = module.get(ActionConfirmationSettingsService);
  });

  describe('findAll', () => {
    it('delegates to ActionConfirmationSettingsService.findAll', async () => {
      service.findAll.mockResolvedValue([setting]);

      const result = await controller.findAll();

      expect(service.findAll).toHaveBeenCalled();
      expect(result).toEqual([setting]);
    });
  });

  describe('findByAction', () => {
    it('delegates to ActionConfirmationSettingsService.findByAction', async () => {
      service.findByAction.mockResolvedValue(setting);

      const result = await controller.findByAction('auth.login');

      expect(service.findByAction).toHaveBeenCalledWith('auth.login');
      expect(result).toBe(setting);
    });

    it('throws NotFoundException when no setting is configured for the action', async () => {
      service.findByAction.mockResolvedValue(null);

      await expect(
        controller.findByAction('auth.login'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('delegates to ActionConfirmationSettingsService.upsert', async () => {
      const dto: UpdateActionConfirmationSettingDto = { enabled: true };
      service.upsert.mockResolvedValue({ ...setting, enabled: true });

      const result = await controller.update('auth.login', dto, user, request);

      expect(service.upsert).toHaveBeenCalledWith(
        'auth.login',
        dto,
        user,
        request,
      );
      expect(result).toEqual({ ...setting, enabled: true });
    });
  });
});
