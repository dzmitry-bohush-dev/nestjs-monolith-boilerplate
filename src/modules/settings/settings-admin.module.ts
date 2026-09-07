import { Module } from '@nestjs/common';

import { AuditLogModule } from '@/core/audit-log/audit-log.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { RbacModule } from '@/modules/rbac/rbac.module';
import { ActionConfirmationSettingsController } from '@/modules/settings/controllers/action-confirmation-settings.controller';
import { SettingsModule } from '@/modules/settings/settings.module';

@Module({
  imports: [SettingsModule, AuthModule, RbacModule, AuditLogModule],
  controllers: [ActionConfirmationSettingsController],
})
export class SettingsAdminModule {}
