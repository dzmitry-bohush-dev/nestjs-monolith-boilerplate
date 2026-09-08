import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { FastifyRequest } from 'fastify';
import type { StringValue } from 'ms';
import { Transactional } from 'typeorm-transactional';

import { AuditLogService } from '@/core/audit-log/audit-log.service';
import { ConfigService } from '@/core/config/config.service';
import { AuthResponseDto } from '@/modules/auth/dtos/auth-response.dto';
import { ConfirmLoginDto } from '@/modules/auth/dtos/confirm-login.dto';
import { LoginConfirmationPendingDto } from '@/modules/auth/dtos/login-confirmation-pending.dto';
import { LoginResultDto } from '@/modules/auth/dtos/login-result.dto';
import { LoginDto } from '@/modules/auth/dtos/login.dto';
import { RegisterDto } from '@/modules/auth/dtos/register.dto';
import { ResendLoginOtpDto } from '@/modules/auth/dtos/resend-login-otp.dto';
import { LoginOtpService } from '@/modules/auth/services/login-otp.service';
import { TokenPair } from '@/modules/auth/services/auth-cookie.service';
import {
  AccessTokenPayload,
  DecodedAccessTokenPayload,
  DecodedRefreshTokenPayload,
  RefreshTokenPayload,
} from '@/modules/auth/types/jwt-payload.type';
import { ActionConfirmationSettingsService } from '@/modules/settings/services/action-confirmation-settings.service';
import { User } from '@/modules/users/entities/user.entity';
import { UsersService } from '@/modules/users/services/users.service';

const LOGIN_CONFIRMATION_ACTION = 'auth.login';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly auditLogService: AuditLogService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly actionConfirmationSettingsService: ActionConfirmationSettingsService,
    private readonly loginOtpService: LoginOtpService,
  ) {}

  @Transactional()
  async register(
    dto: RegisterDto,
    request?: FastifyRequest,
  ): Promise<AuthResponseDto> {
    const existing = await this.usersService.findByEmail(dto.email);

    if (existing) {
      throw new ConflictException('Invalid email or password');
    }

    const saltRounds = Number(this.configService.get('BCRYPT_SALT_ROUNDS'));
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const user = await this.usersService.create(dto.email, passwordHash);

    await this.auditLogService.record({
      eventType: 'USER_REGISTERED',
      userId: user.id,
      email: user.email,
      request,
    });

    return AuthResponseDto.from({
      accessToken: this.issueTokenPair(user).accessToken,
      user,
    });
  }

  async login(
    dto: LoginDto,
    request?: FastifyRequest,
  ): Promise<LoginResultDto> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      await this.auditLogService.record({
        eventType: 'USER_LOGIN_FAILED',
        email: dto.email,
        request,
      });

      throw new UnauthorizedException('Invalid email or password');
    }

    const confirmationEnabled =
      await this.actionConfirmationSettingsService.isEnabled(
        LOGIN_CONFIRMATION_ACTION,
      );

    if (!confirmationEnabled) {
      await this.auditLogService.record({
        eventType: 'USER_LOGGED_IN',
        userId: user.id,
        email: user.email,
        request,
      });

      return {
        status: 'AUTHENTICATED',
        body: AuthResponseDto.from({
          accessToken: this.issueTokenPair(user).accessToken,
          user,
        }),
      };
    }

    const pending = await this.loginOtpService.initiate(user, request);

    await this.auditLogService.record({
      eventType: 'LOGIN_CONFIRMATION_REQUIRED',
      userId: user.id,
      email: user.email,
      request,
      metadata: { attemptId: pending.attemptId },
    });

    return { status: 'CONFIRMATION_REQUIRED', body: pending };
  }

  async confirmLogin(
    dto: ConfirmLoginDto,
    request?: FastifyRequest,
  ): Promise<AuthResponseDto> {
    const user = await this.loginOtpService.confirm(
      dto.attemptId,
      dto.otpCode,
      request,
    );

    await this.auditLogService.record({
      eventType: 'USER_LOGGED_IN',
      userId: user.id,
      email: user.email,
      request,
    });

    return AuthResponseDto.from({
      accessToken: this.issueTokenPair(user).accessToken,
      user,
    });
  }

  async resendLoginOtp(
    dto: ResendLoginOtpDto,
    request?: FastifyRequest,
  ): Promise<LoginConfirmationPendingDto> {
    return this.loginOtpService.resend(dto.attemptId, request);
  }

  async recordLogout(request: FastifyRequest): Promise<void> {
    const userId = this.decodeAccessTokenUserId(request);

    await this.auditLogService.record({
      eventType: 'USER_LOGGED_OUT',
      userId,
      request,
    });
  }

  private decodeAccessTokenUserId(request: FastifyRequest): string | undefined {
    const cookie = request.cookies?.access_token;

    if (!cookie) {
      return undefined;
    }

    try {
      const payload = this.jwtService.decode<DecodedAccessTokenPayload>(cookie);

      return payload?.type === 'access' ? payload.sub : undefined;
    } catch {
      return undefined;
    }
  }

  async refresh(
    request: FastifyRequest,
  ): Promise<{ user: User; tokens: TokenPair }> {
    const cookie = request.cookies?.refresh_token;

    if (!cookie) {
      await this.auditLogService.record({
        eventType: 'TOKEN_REFRESH_FAILED',
        request,
        metadata: { reason: 'missing_cookie' },
      });

      throw new UnauthorizedException();
    }

    let payload: DecodedRefreshTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<DecodedRefreshTokenPayload>(
        cookie,
        {
          secret: this.configService.get('JWT_REFRESH_SECRET'),
          issuer: this.configService.get('JWT_ISSUER'),
          audience: this.configService.get('JWT_AUDIENCE'),
        },
      );
    } catch (error) {
      await this.auditLogService.record({
        eventType: 'TOKEN_REFRESH_FAILED',
        request,
        metadata: { reason: this.refreshFailureReason(error) },
      });

      throw new UnauthorizedException();
    }

    if (payload.type !== 'refresh') {
      await this.auditLogService.record({
        eventType: 'TOKEN_REFRESH_FAILED',
        request,
        metadata: { reason: 'wrong_token_type' },
      });

      throw new UnauthorizedException();
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      await this.auditLogService.record({
        eventType: 'TOKEN_REFRESH_FAILED',
        request,
        metadata: { reason: 'user_not_found' },
      });

      throw new UnauthorizedException();
    }

    const tokens = this.issueTokenPair(user);

    await this.auditLogService.record({
      eventType: 'TOKEN_REFRESH_SUCCEEDED',
      userId: user.id,
      email: user.email,
      request,
    });

    return { user, tokens };
  }

  private refreshFailureReason(error: unknown): string {
    if (error instanceof Error && error.name === 'TokenExpiredError') {
      return 'jwt_expired';
    }

    return 'invalid_signature';
  }

  private signAccessToken(user: { id: string; email: string }): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      type: 'access',
    };

    return this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_SECRET'),
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRATION') as StringValue,
      issuer: this.configService.get('JWT_ISSUER'),
      audience: this.configService.get('JWT_AUDIENCE'),
    });
  }

  private signRefreshToken(userId: string): string {
    const payload: RefreshTokenPayload = { sub: userId, type: 'refresh' };

    return this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get(
        'JWT_REFRESH_EXPIRATION',
      ) as StringValue,
      issuer: this.configService.get('JWT_ISSUER'),
      audience: this.configService.get('JWT_AUDIENCE'),
    });
  }

  private issueTokenPair(user: { id: string; email: string }): {
    accessToken: string;
    refreshToken: string;
  } {
    return {
      accessToken: this.signAccessToken(user),
      refreshToken: this.signRefreshToken(user.id),
    };
  }
}
