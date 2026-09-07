import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FastifyRequest } from 'fastify';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';

import { AuditLogService } from '@/core/audit-log/audit-log.service';
import type { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';
import { UpdateActionConfirmationSettingDto } from '@/modules/settings/dtos/update-action-confirmation-setting.dto';
import { ActionConfirmationSetting } from '@/modules/settings/entities/action-confirmation-setting.entity';

export const SUPPORTED_ACTIONS = ['auth.login'] as const;
export type SupportedAction = (typeof SUPPORTED_ACTIONS)[number];

@Injectable()
export class ActionConfirmationSettingsService {
  constructor(
    @InjectRepository(ActionConfirmationSetting)
    private actionConfirmationSettingRepository: Repository<ActionConfirmationSetting>,
    private auditLogService: AuditLogService,
  ) {}

  async isEnabled(action: string): Promise<boolean> {
    const setting = await this.findByAction(action);
    return setting?.enabled ?? false;
  }

  async findByAction(
    action: string,
  ): Promise<ActionConfirmationSetting | null> {
    this.validateAction(action);
    return this.actionConfirmationSettingRepository.findOne({
      where: { action },
    });
  }

  async findAll(): Promise<ActionConfirmationSetting[]> {
    return this.actionConfirmationSettingRepository.find({
      order: { action: 'ASC' },
    });
  }

  @Transactional()
  async upsert(
    action: string,
    dto: UpdateActionConfirmationSettingDto,
    adminUser: AuthenticatedUser,
    request?: FastifyRequest,
  ): Promise<ActionConfirmationSetting> {
    this.validateAction(action);

    const existing = await this.actionConfirmationSettingRepository.findOne({
      where: { action },
    });
    const setting =
      existing ?? this.actionConfirmationSettingRepository.create({ action });

    setting.enabled = dto.enabled;
    if (dto.confirmationMethod) {
      setting.confirmationMethod = dto.confirmationMethod;
    }
    setting.updatedByUserId = adminUser.userId;

    const saved = await this.actionConfirmationSettingRepository.save(setting);

    await this.auditLogService.record({
      eventType: 'ADMIN_ACTION_CONFIRMATION_SETTING_UPDATED',
      userId: adminUser.userId,
      request,
      metadata: {
        action: saved.action,
        enabled: saved.enabled,
        confirmationMethod: saved.confirmationMethod,
      },
    });

    return saved;
  }

  private validateAction(action: string): void {
    if (!SUPPORTED_ACTIONS.includes(action as SupportedAction)) {
      throw new BadRequestException(
        `Unsupported action "${action}". Supported actions: ${SUPPORTED_ACTIONS.join(', ')}`,
      );
    }
  }
}
