import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditLogModule } from '@/core/audit-log/audit-log.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { RbacModule } from '@/modules/rbac/rbac.module';
import { UsersController } from '@/modules/users/controllers/users.controller';
import { User } from '@/modules/users/entities/user.entity';
import { UserProfileAccessGuard } from '@/modules/users/guards/user-profile-access.guard';
import { UsersService } from '@/modules/users/services/users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    AuditLogModule,
    forwardRef(() => AuthModule),
    forwardRef(() => RbacModule),
  ],
  controllers: [UsersController],
  providers: [UsersService, UserProfileAccessGuard],
  exports: [UsersService],
})
export class UsersModule {}
