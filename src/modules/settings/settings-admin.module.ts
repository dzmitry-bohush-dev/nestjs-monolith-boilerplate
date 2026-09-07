import { Module } from '@nestjs/common';

import { AuthModule } from '@/modules/auth/auth.module';
import { RbacModule } from '@/modules/rbac/rbac.module';
import { ActionConfirmationSettingsController } from '@/modules/settings/controllers/action-confirmation-settings.controller';
import { SettingsModule } from '@/modules/settings/settings.module';

@Module({
  imports: [SettingsModule, AuthModule, RbacModule],
  controllers: [ActionConfirmationSettingsController],
})
export class SettingsAdminModule {}
