import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditLogModule } from '@/core/audit-log/audit-log.module';
import { MailerModule } from '@/core/mailer/mailer.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { RbacModule } from '@/modules/rbac/rbac.module';
import { UsersController } from '@/modules/users/controllers/users.controller';
import { PendingEmailChange } from '@/modules/users/entities/pending-email-change.entity';
import { User } from '@/modules/users/entities/user.entity';
import { SelfOnlyGuard } from '@/modules/users/guards/self-only.guard';
import { UserProfileAccessGuard } from '@/modules/users/guards/user-profile-access.guard';
import { EmailChangeService } from '@/modules/users/services/email-change.service';
import { UsersService } from '@/modules/users/services/users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, PendingEmailChange]),
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
    SelfOnlyGuard,
  ],
  exports: [UsersService],
})
export class UsersModule {}
