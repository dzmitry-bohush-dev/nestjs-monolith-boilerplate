import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { StringValue } from 'ms';

import { AuditLogModule } from '@/core/audit-log/audit-log.module';
import { ConfigModule } from '@/core/config/config.module';
import { ConfigService } from '@/core/config/config.service';
import { MailerModule } from '@/core/mailer/mailer.module';
import { AuthController } from '@/modules/auth/controllers/auth.controller';
import { PendingLoginAttempt } from '@/modules/auth/entities/pending-login-attempt.entity';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { AuthService } from '@/modules/auth/services/auth.service';
import { LoginOtpService } from '@/modules/auth/services/login-otp.service';
import { JwtStrategy } from '@/modules/auth/strategies/jwt.strategy';
import { SettingsModule } from '@/modules/settings/settings.module';
import { UsersModule } from '@/modules/users/users.module';

@Module({
  imports: [
    UsersModule,
    AuditLogModule,
    SettingsModule,
    MailerModule,
    TypeOrmModule.forFeature([PendingLoginAttempt]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get('JWT_ACCESS_EXPIRATION') as StringValue,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, LoginOtpService, JwtStrategy, JwtAuthGuard],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
