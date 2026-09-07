import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditLogModule } from '@/core/audit-log/audit-log.module';
import { ActionConfirmationSetting } from '@/modules/settings/entities/action-confirmation-setting.entity';
import { ActionConfirmationSettingsService } from '@/modules/settings/services/action-confirmation-settings.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ActionConfirmationSetting]),
    AuditLogModule,
  ],
  providers: [ActionConfirmationSettingsService],
  exports: [ActionConfirmationSettingsService],
})
export class SettingsModule {}
