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
  let usersService: { findByEmail: jest.Mock; create: jest.Mock };
  let auditLogService: { record: jest.Mock };
  let jwtService: { sign: jest.Mock; decode: jest.Mock };
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: { findByEmail: jest.fn(), create: jest.fn() },
        },
        {
          provide: AuditLogService,
          useValue: { record: jest.fn() },
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn(), decode: jest.fn() },
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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    const dto: RegisterDto = {
      email: 'test@example.com',
      password: 'p@ssw0rd123',
    };

    it('registers a new user, records the audit event and returns a token', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      configService.get.mockReturnValue('16');
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      usersService.create.mockResolvedValue(user);
      jwtService.sign.mockReturnValue('access-token');

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
        { secret: '16', expiresIn: '16', issuer: '16', audience: '16' },
      );
      expect(result).toEqual({
        accessToken: 'access-token',
        user: { id: user.id, email: user.email },
      });
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
      it('logs the user in, records USER_LOGGED_IN and returns an AUTHENTICATED result', async () => {
        usersService.findByEmail.mockResolvedValue(user);
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);
        actionConfirmationSettingsService.isEnabled.mockResolvedValue(false);
        jwtService.sign.mockReturnValue('access-token');

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
          body: {
            accessToken: 'access-token',
            user: { id: user.id, email: user.email },
          },
        });
      });
    });

    describe('when confirmation is enabled', () => {
      it('initiates an OTP attempt, records LOGIN_CONFIRMATION_REQUIRED and returns a CONFIRMATION_REQUIRED result without issuing a token', async () => {
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

    it('delegates to LoginOtpService.confirm, records USER_LOGGED_IN and returns a token', async () => {
      loginOtpService.confirm.mockResolvedValue(user);
      jwtService.sign.mockReturnValue('access-token');

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
      expect(result).toEqual({
        accessToken: 'access-token',
        user: { id: user.id, email: user.email },
      });
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
});
