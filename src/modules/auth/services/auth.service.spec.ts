jest.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));
jest.mock('bcrypt');

import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';

import { AuditLogService } from '@/core/audit-log/audit-log.service';
import { ConfigService } from '@/core/config/config.service';
import { ConfirmLoginDto } from '@/modules/auth/dtos/confirm-login.dto';
import { LoginConfirmationPendingDto } from '@/modules/auth/dtos/login-confirmation-pending.dto';
import { RegisterDto } from '@/modules/auth/dtos/register.dto';
import { LoginDto } from '@/modules/auth/dtos/login.dto';
import { ResendLoginOtpDto } from '@/modules/auth/dtos/resend-login-otp.dto';
import { AuthService } from '@/modules/auth/services/auth.service';
import { LoginOtpService } from '@/modules/auth/services/login-otp.service';
import { ActionConfirmationSettingsService } from '@/modules/settings/services/action-confirmation-settings.service';
import { User } from '@/modules/users/entities/user.entity';
import { UsersService } from '@/modules/users/services/users.service';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
  };
  let auditLogService: { record: jest.Mock };
  let jwtService: {
    sign: jest.Mock;
    decode: jest.Mock;
    verifyAsync: jest.Mock;
  };
  let configService: { get: jest.Mock };
  let actionConfirmationSettingsService: { isEnabled: jest.Mock };
  let loginOtpService: {
    initiate: jest.Mock;
    resend: jest.Mock;
    confirm: jest.Mock;
  };

  const user = {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
  } as User;

  const pending: LoginConfirmationPendingDto = {
    attemptId: 'attempt-1',
    confirmationMethod: 'otp',
    expiresAt: new Date('2026-01-01T00:10:00.000Z'),
    resendAvailableAt: new Date('2026-01-01T00:01:00.000Z'),
  };

  const configValues: Record<string, string> = {
    BCRYPT_SALT_ROUNDS: '16',
    JWT_SECRET: 'access-secret',
    JWT_ACCESS_EXPIRATION: '15m',
    JWT_REFRESH_SECRET: 'refresh-secret',
    JWT_REFRESH_EXPIRATION: '30d',
    JWT_ISSUER: 'test-issuer',
    JWT_AUDIENCE: 'test-audience',
  };

  const tokens = { accessToken: 'access-token', refreshToken: 'refresh-token' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            findById: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: AuditLogService,
          useValue: { record: jest.fn() },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
            decode: jest.fn(),
            verifyAsync: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        {
          provide: ActionConfirmationSettingsService,
          useValue: { isEnabled: jest.fn() },
        },
        {
          provide: LoginOtpService,
          useValue: {
            initiate: jest.fn(),
            resend: jest.fn(),
            confirm: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    auditLogService = module.get(AuditLogService);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);
    actionConfirmationSettingsService = module.get(
      ActionConfirmationSettingsService,
    );
    loginOtpService = module.get(LoginOtpService);

    configService.get.mockImplementation((key: string) => configValues[key]);
    jwtService.sign.mockImplementation((payload: { type: string }) =>
      payload.type === 'access' ? tokens.accessToken : tokens.refreshToken,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    const dto: RegisterDto = {
      email: 'test@example.com',
      password: 'p@ssw0rd123',
    };

    it('registers a new user, records the audit event and issues a token pair', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      usersService.create.mockResolvedValue(user);

      const result = await service.register(dto);

      expect(usersService.findByEmail).toHaveBeenCalledWith(dto.email);
      expect(bcrypt.hash).toHaveBeenCalledWith(dto.password, 16);
      expect(usersService.create).toHaveBeenCalledWith(
        dto.email,
        'hashed-password',
      );
      expect(auditLogService.record).toHaveBeenCalledWith({
        eventType: 'USER_REGISTERED',
        userId: user.id,
        email: user.email,
        request: undefined,
      });
      expect(jwtService.sign).toHaveBeenCalledWith(
        { sub: user.id, email: user.email, type: 'access' },
        {
          secret: 'access-secret',
          expiresIn: '15m',
          issuer: 'test-issuer',
          audience: 'test-audience',
        },
      );
      expect(jwtService.sign).toHaveBeenCalledWith(
        { sub: user.id, type: 'refresh' },
        {
          secret: 'refresh-secret',
          expiresIn: '30d',
          issuer: 'test-issuer',
          audience: 'test-audience',
        },
      );
      expect(result).toEqual({ user, tokens });
    });

    it('throws a conflict exception when the email is already registered', async () => {
      usersService.findByEmail.mockResolvedValue(user);

      await expect(service.register(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(usersService.create).not.toHaveBeenCalled();
      expect(auditLogService.record).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const dto: LoginDto = {
      email: 'test@example.com',
      password: 'p@ssw0rd123',
    };

    it('throws unauthorized and audits USER_LOGIN_FAILED when the email is unknown', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(auditLogService.record).toHaveBeenCalledWith({
        eventType: 'USER_LOGIN_FAILED',
        email: dto.email,
        request: undefined,
      });
      expect(
        actionConfirmationSettingsService.isEnabled,
      ).not.toHaveBeenCalled();
    });

    it('throws unauthorized and audits USER_LOGIN_FAILED when the password is wrong', async () => {
      usersService.findByEmail.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(dto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(auditLogService.record).toHaveBeenCalledWith({
        eventType: 'USER_LOGIN_FAILED',
        email: dto.email,
        request: undefined,
      });
    });

    describe('when confirmation is disabled', () => {
      it('logs the user in, records USER_LOGGED_IN and returns an AUTHENTICATED result with a token pair', async () => {
        usersService.findByEmail.mockResolvedValue(user);
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);
        actionConfirmationSettingsService.isEnabled.mockResolvedValue(false);

        const result = await service.login(dto);

        expect(bcrypt.compare).toHaveBeenCalledWith(
          dto.password,
          user.passwordHash,
        );
        expect(
          actionConfirmationSettingsService.isEnabled,
        ).toHaveBeenCalledWith('auth.login');
        expect(loginOtpService.initiate).not.toHaveBeenCalled();
        expect(auditLogService.record).toHaveBeenCalledWith({
          eventType: 'USER_LOGGED_IN',
          userId: user.id,
          email: user.email,
          request: undefined,
        });
        expect(result).toEqual({
          status: 'AUTHENTICATED',
          body: { user: { id: user.id, email: user.email } },
          tokens,
        });
      });
    });

    describe('when confirmation is enabled', () => {
      it('initiates an OTP attempt, records LOGIN_CONFIRMATION_REQUIRED and returns a CONFIRMATION_REQUIRED result without issuing tokens', async () => {
        usersService.findByEmail.mockResolvedValue(user);
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);
        actionConfirmationSettingsService.isEnabled.mockResolvedValue(true);
        loginOtpService.initiate.mockResolvedValue(pending);

        const result = await service.login(dto);

        expect(loginOtpService.initiate).toHaveBeenCalledWith(user, undefined);
        expect(auditLogService.record).toHaveBeenCalledWith({
          eventType: 'LOGIN_CONFIRMATION_REQUIRED',
          userId: user.id,
          email: user.email,
          request: undefined,
          metadata: { attemptId: pending.attemptId },
        });
        expect(jwtService.sign).not.toHaveBeenCalled();
        expect(result).toEqual({
          status: 'CONFIRMATION_REQUIRED',
          body: pending,
        });
      });
    });
  });

  describe('confirmLogin', () => {
    const dto: ConfirmLoginDto = { attemptId: 'attempt-1', otpCode: '123456' };

    it('delegates to LoginOtpService.confirm, records USER_LOGGED_IN and returns a token pair', async () => {
      loginOtpService.confirm.mockResolvedValue(user);

      const result = await service.confirmLogin(dto);

      expect(loginOtpService.confirm).toHaveBeenCalledWith(
        dto.attemptId,
        dto.otpCode,
        undefined,
      );
      expect(auditLogService.record).toHaveBeenCalledWith({
        eventType: 'USER_LOGGED_IN',
        userId: user.id,
        email: user.email,
        request: undefined,
      });
      expect(result).toEqual({ user, tokens });
    });

    it('propagates the rejection when LoginOtpService.confirm throws', async () => {
      loginOtpService.confirm.mockRejectedValue(
        new UnauthorizedException('Invalid or expired confirmation code'),
      );

      await expect(service.confirmLogin(dto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(auditLogService.record).not.toHaveBeenCalled();
    });
  });

  describe('resendLoginOtp', () => {
    const dto: ResendLoginOtpDto = { attemptId: 'attempt-1' };

    it('delegates to LoginOtpService.resend', async () => {
      loginOtpService.resend.mockResolvedValue(pending);

      const result = await service.resendLoginOtp(dto);

      expect(loginOtpService.resend).toHaveBeenCalledWith(
        dto.attemptId,
        undefined,
      );
      expect(result).toBe(pending);
    });
  });

  describe('recordLogout', () => {
    it('records USER_LOGGED_OUT with the userId decoded from the access token cookie', async () => {
      const request = {
        cookies: { access_token: 'access-token' },
      } as unknown as Parameters<typeof service.recordLogout>[0];
      jwtService.decode.mockReturnValue({ sub: user.id, type: 'access' });

      await service.recordLogout(request);

      expect(jwtService.decode).toHaveBeenCalledWith('access-token');
      expect(auditLogService.record).toHaveBeenCalledWith({
        eventType: 'USER_LOGGED_OUT',
        userId: user.id,
        request,
      });
    });

    it('records an anonymous USER_LOGGED_OUT when there is no access token cookie', async () => {
      const request = {
        cookies: {},
      } as unknown as Parameters<typeof service.recordLogout>[0];

      await service.recordLogout(request);

      expect(jwtService.decode).not.toHaveBeenCalled();
      expect(auditLogService.record).toHaveBeenCalledWith({
        eventType: 'USER_LOGGED_OUT',
        userId: undefined,
        request,
      });
    });

    it('records an anonymous USER_LOGGED_OUT when the cookie fails to decode', async () => {
      const request = {
        cookies: { access_token: 'garbage' },
      } as unknown as Parameters<typeof service.recordLogout>[0];
      jwtService.decode.mockImplementation(() => {
        throw new Error('malformed token');
      });

      await service.recordLogout(request);

      expect(auditLogService.record).toHaveBeenCalledWith({
        eventType: 'USER_LOGGED_OUT',
        userId: undefined,
        request,
      });
    });

    it('records an anonymous USER_LOGGED_OUT when the decoded token is a refresh token', async () => {
      const request = {
        cookies: { access_token: 'refresh-token' },
      } as unknown as Parameters<typeof service.recordLogout>[0];
      jwtService.decode.mockReturnValue({ sub: user.id, type: 'refresh' });

      await service.recordLogout(request);

      expect(auditLogService.record).toHaveBeenCalledWith({
        eventType: 'USER_LOGGED_OUT',
        userId: undefined,
        request,
      });
    });
  });

  describe('refresh', () => {
    const requestWithCookie = (cookie?: string) =>
      ({
        cookies: cookie ? { refresh_token: cookie } : {},
      }) as unknown as Parameters<typeof service.refresh>[0];

    it('throws unauthorized and audits TOKEN_REFRESH_FAILED (missing_cookie) when there is no refresh cookie', async () => {
      const request = requestWithCookie();

      await expect(service.refresh(request)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
      expect(auditLogService.record).toHaveBeenCalledWith({
        eventType: 'TOKEN_REFRESH_FAILED',
        request,
        metadata: { reason: 'missing_cookie' },
      });
    });

    it('throws unauthorized and audits TOKEN_REFRESH_FAILED (jwt_expired) when the token has expired', async () => {
      const request = requestWithCookie('expired-refresh-token');
      const expiredError = new Error('jwt expired');
      expiredError.name = 'TokenExpiredError';
      jwtService.verifyAsync.mockRejectedValue(expiredError);

      await expect(service.refresh(request)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(jwtService.verifyAsync).toHaveBeenCalledWith(
        'expired-refresh-token',
        {
          secret: 'refresh-secret',
          issuer: 'test-issuer',
          audience: 'test-audience',
        },
      );
      expect(auditLogService.record).toHaveBeenCalledWith({
        eventType: 'TOKEN_REFRESH_FAILED',
        request,
        metadata: { reason: 'jwt_expired' },
      });
    });

    it('throws unauthorized and audits TOKEN_REFRESH_FAILED (invalid_signature) when verification fails for another reason', async () => {
      const request = requestWithCookie('garbage');
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));

      await expect(service.refresh(request)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(auditLogService.record).toHaveBeenCalledWith({
        eventType: 'TOKEN_REFRESH_FAILED',
        request,
        metadata: { reason: 'invalid_signature' },
      });
    });

    it('throws unauthorized and audits TOKEN_REFRESH_FAILED (wrong_token_type) when an access token is presented', async () => {
      const request = requestWithCookie('access-token-used-as-refresh');
      jwtService.verifyAsync.mockResolvedValue({
        sub: user.id,
        email: user.email,
        type: 'access',
      });

      await expect(service.refresh(request)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(usersService.findById).not.toHaveBeenCalled();
      expect(auditLogService.record).toHaveBeenCalledWith({
        eventType: 'TOKEN_REFRESH_FAILED',
        request,
        metadata: { reason: 'wrong_token_type' },
      });
    });

    it('throws unauthorized and audits TOKEN_REFRESH_FAILED (user_not_found) when the user no longer exists', async () => {
      const request = requestWithCookie('valid-refresh-token');
      jwtService.verifyAsync.mockResolvedValue({
        sub: user.id,
        type: 'refresh',
      });
      usersService.findById.mockResolvedValue(null);

      await expect(service.refresh(request)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(auditLogService.record).toHaveBeenCalledWith({
        eventType: 'TOKEN_REFRESH_FAILED',
        request,
        metadata: { reason: 'user_not_found' },
      });
    });

    it('issues a rotated token pair and records TOKEN_REFRESH_SUCCEEDED on success', async () => {
      const request = requestWithCookie('valid-refresh-token');
      jwtService.verifyAsync.mockResolvedValue({
        sub: user.id,
        type: 'refresh',
      });
      usersService.findById.mockResolvedValue(user);

      const result = await service.refresh(request);

      expect(usersService.findById).toHaveBeenCalledWith(user.id);
      expect(auditLogService.record).toHaveBeenCalledWith({
        eventType: 'TOKEN_REFRESH_SUCCEEDED',
        userId: user.id,
        email: user.email,
        request,
      });
      expect(result).toEqual({ user, tokens });
    });
  });
});
