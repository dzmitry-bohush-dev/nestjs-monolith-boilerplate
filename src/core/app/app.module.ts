import { Module } from '@nestjs/common';

import { AuditLogModule } from '@/core/audit-log/audit-log.module';
import { ConfigModule } from '@/core/config/config.module';
import { DatabaseModule } from '@/core/database/database.module';
import { HealthModule } from '@/core/health/health.module';
import { ThrottlerModule } from '@/core/throttler/throttler.module';

/**
 *
 * Application modules
 *
 */
import { AuthModule } from '@/modules/auth/auth.module';
import { RbacModule } from '@/modules/rbac/rbac.module';
import { SettingsAdminModule } from '@/modules/settings/settings-admin.module';
import { UsersModule } from '@/modules/users/users.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    HealthModule,
    ThrottlerModule,
    AuditLogModule,
    /**
     *
     * Application modules
     *
     */
    UsersModule,
    AuthModule,
    RbacModule,
    SettingsAdminModule,
  ],
})
export class AppModule {}
