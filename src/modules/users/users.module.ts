import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditLogModule } from '@/core/audit-log/audit-log.module';
import { MailerModule } from '@/core/mailer/mailer.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { PendingLoginAttempt } from '@/modules/auth/entities/pending-login-attempt.entity';
import { RbacModule } from '@/modules/rbac/rbac.module';
import { UserRole } from '@/modules/rbac/entities/user-role.entity';
import { UsersController } from '@/modules/users/controllers/users.controller';
import { PendingEmailChange } from '@/modules/users/entities/pending-email-change.entity';
import { PendingUserDeletion } from '@/modules/users/entities/pending-user-deletion.entity';
import { User } from '@/modules/users/entities/user.entity';
import { SelfOnlyGuard } from '@/modules/users/guards/self-only.guard';
import { UserProfileAccessGuard } from '@/modules/users/guards/user-profile-access.guard';
import { EmailChangeService } from '@/modules/users/services/email-change.service';
import { UserDeletionService } from '@/modules/users/services/user-deletion.service';
import { UsersService } from '@/modules/users/services/users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      PendingEmailChange,
      PendingUserDeletion,
      UserRole,
      PendingLoginAttempt,
    ]),
    AuditLogModule,
    MailerModule,
    forwardRef(() => AuthModule),
    forwardRef(() => RbacModule),
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    UserProfileAccessGuard,
    EmailChangeService,
    UserDeletionService,
    SelfOnlyGuard,
  ],
  exports: [UsersService],
})
export class UsersModule {}
