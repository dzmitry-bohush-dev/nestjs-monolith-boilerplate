import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { StringValue } from 'ms';

import { AuditLogModule } from '@/core/audit-log/audit-log.module';
import { ConfigModule } from '@/core/config/config.module';
import { ConfigService } from '@/core/config/config.service';
import { AuthController } from '@/modules/auth/controllers/auth.controller';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { AuthService } from '@/modules/auth/services/auth.service';
import { JwtStrategy } from '@/modules/auth/strategies/jwt.strategy';
import { UsersModule } from '@/modules/users/users.module';

@Module({
  imports: [
    UsersModule,
    AuditLogModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get('JWT_EXPIRES_IN') as StringValue,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
