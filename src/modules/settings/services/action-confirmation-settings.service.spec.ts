jest.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));

import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FastifyRequest } from 'fastify';

import { AuditLogService } from '@/core/audit-log/audit-log.service';
import type { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';
import { UpdateActionConfirmationSettingDto } from '@/modules/settings/dtos/update-action-confirmation-setting.dto';
import { ActionConfirmationSetting } from '@/modules/settings/entities/action-confirmation-setting.entity';
import { ActionConfirmationSettingsService } from '@/modules/settings/services/action-confirmation-settings.service';

describe('ActionConfirmationSettingsService', () => {
  let service: ActionConfirmationSettingsService;
  let repository: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let auditLogService: { record: jest.Mock };

  const adminUser: AuthenticatedUser = {
    userId: 'admin-1',
    email: 'admin@example.com',
  };
  const request = {} as FastifyRequest;

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
      providers: [
        ActionConfirmationSettingsService,
        {
          provide: getRepositoryToken(ActionConfirmationSetting),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: AuditLogService,
          useValue: { record: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ActionConfirmationSettingsService>(
      ActionConfirmationSettingsService,
    );
    repository = module.get(getRepositoryToken(ActionConfirmationSetting));
    auditLogService = module.get(AuditLogService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isEnabled', () => {
    it('returns false when no row exists for the action', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.isEnabled('auth.login')).resolves.toBe(false);
    });

    it('returns the stored enabled flag when a row exists', async () => {
      repository.findOne.mockResolvedValue({ ...setting, enabled: true });

      await expect(service.isEnabled('auth.login')).resolves.toBe(true);
    });
  });

  describe('findByAction', () => {
    it('returns the row for a supported action', async () => {
      repository.findOne.mockResolvedValue(setting);

      await expect(service.findByAction('auth.login')).resolves.toBe(setting);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { action: 'auth.login' },
      });
    });

    it('throws BadRequestException for an unsupported action', async () => {
      await expect(
        service.findByAction('unsupported.action'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('returns all rows ordered by action', async () => {
      repository.find.mockResolvedValue([setting]);

      await expect(service.findAll()).resolves.toEqual([setting]);
      expect(repository.find).toHaveBeenCalledWith({
        order: { action: 'ASC' },
      });
    });
  });

  describe('upsert', () => {
    const dto: UpdateActionConfirmationSettingDto = { enabled: true };

    it('creates a new row, records the audit event, and returns the saved setting', async () => {
      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue({ action: 'auth.login' });
      repository.save.mockImplementation(
        (row: Partial<ActionConfirmationSetting>) =>
          Promise.resolve({
            ...setting,
            ...row,
          } as ActionConfirmationSetting),
      );

      const result = await service.upsert(
        'auth.login',
        dto,
        adminUser,
        request,
      );

      expect(repository.create).toHaveBeenCalledWith({ action: 'auth.login' });
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'auth.login',
          enabled: true,
          updatedByUserId: adminUser.userId,
        }),
      );
      expect(auditLogService.record).toHaveBeenCalledWith({
        eventType: 'ADMIN_ACTION_CONFIRMATION_SETTING_UPDATED',
        userId: adminUser.userId,
        request,
        metadata: {
          action: 'auth.login',
          enabled: true,
          confirmationMethod: 'otp',
        },
      });
      expect(result.enabled).toBe(true);
    });

    it('updates an existing row in place without recreating it', async () => {
      repository.findOne.mockResolvedValue({ ...setting });
      repository.save.mockImplementation(
        (row: Partial<ActionConfirmationSetting>) =>
          Promise.resolve(row as ActionConfirmationSetting),
      );

      await service.upsert(
        'auth.login',
        { enabled: true, confirmationMethod: 'otp' },
        adminUser,
        request,
      );

      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: setting.id, enabled: true }),
      );
    });

    it('throws BadRequestException for an unsupported action', async () => {
      await expect(
        service.upsert('unsupported.action', dto, adminUser, request),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.findOne).not.toHaveBeenCalled();
      expect(auditLogService.record).not.toHaveBeenCalled();
    });
  });
});
