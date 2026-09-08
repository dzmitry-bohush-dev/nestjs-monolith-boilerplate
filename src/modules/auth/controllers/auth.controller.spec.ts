import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyReply, FastifyRequest } from 'fastify';

import { AuthController } from '@/modules/auth/controllers/auth.controller';
import { AuthResponseDto } from '@/modules/auth/dtos/auth-response.dto';
import { ConfirmLoginDto } from '@/modules/auth/dtos/confirm-login.dto';
import { LoginConfirmationPendingDto } from '@/modules/auth/dtos/login-confirmation-pending.dto';
import { LoginDto } from '@/modules/auth/dtos/login.dto';
import { RegisterDto } from '@/modules/auth/dtos/register.dto';
import { ResendLoginOtpDto } from '@/modules/auth/dtos/resend-login-otp.dto';
import { AuthCookieService } from '@/modules/auth/services/auth-cookie.service';
import { AuthService } from '@/modules/auth/services/auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    register: jest.Mock;
    login: jest.Mock;
    confirmLogin: jest.Mock;
    resendLoginOtp: jest.Mock;
    refresh: jest.Mock;
  };
  let authCookieService: { setAuthCookies: jest.Mock };

  const request = {} as FastifyRequest;
  const response: AuthResponseDto = {
    accessToken: 'access-token',
    user: { id: 'user-1', email: 'test@example.com' },
  };
  const pending: LoginConfirmationPendingDto = {
    attemptId: 'attempt-1',
    confirmationMethod: 'otp',
    expiresAt: new Date('2026-01-01T00:10:00.000Z'),
    resendAvailableAt: new Date('2026-01-01T00:01:00.000Z'),
  };

  const createReply = (): jest.Mocked<Pick<FastifyReply, 'status'>> => {
    const reply = { status: jest.fn() };
    reply.status.mockReturnValue(reply);
    return reply as unknown as jest.Mocked<Pick<FastifyReply, 'status'>>;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            register: jest.fn(),
            login: jest.fn(),
            confirmLogin: jest.fn(),
            resendLoginOtp: jest.fn(),
            refresh: jest.fn(),
          },
        },
        {
          provide: AuthCookieService,
          useValue: {
            setAuthCookies: jest.fn(),
            clearAuthCookies: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
    authCookieService = module.get(AuthCookieService);
  });

  describe('register', () => {
    it('delegates to AuthService.register', async () => {
      const dto: RegisterDto = {
        email: 'test@example.com',
        password: 'p@ssw0rd123',
      };
      authService.register.mockResolvedValue(response);

      const result = await controller.register(dto, request);

      expect(authService.register).toHaveBeenCalledWith(dto, request);
      expect(result).toBe(response);
    });
  });

  describe('login', () => {
    const dto: LoginDto = {
      email: 'test@example.com',
      password: 'p@ssw0rd123',
    };

    it('returns the body as-is and never sets a status when authenticated', async () => {
      const reply = createReply();
      authService.login.mockResolvedValue({
        status: 'AUTHENTICATED',
        body: response,
      });

      const result = await controller.login(
        dto,
        request,
        reply as unknown as FastifyReply,
      );

      expect(authService.login).toHaveBeenCalledWith(dto, request);
      expect(reply.status).not.toHaveBeenCalled();
      expect(result).toBe(response);
    });

    it('sets a 202 status and returns the pending body when confirmation is required', async () => {
      const reply = createReply();
      authService.login.mockResolvedValue({
        status: 'CONFIRMATION_REQUIRED',
        body: pending,
      });

      const result = await controller.login(
        dto,
        request,
        reply as unknown as FastifyReply,
      );

      expect(reply.status).toHaveBeenCalledWith(HttpStatus.ACCEPTED);
      expect(result).toBe(pending);
    });
  });

  describe('confirmLogin', () => {
    it('delegates to AuthService.confirmLogin', async () => {
      const dto: ConfirmLoginDto = {
        attemptId: 'attempt-1',
        otpCode: '123456',
      };
      authService.confirmLogin.mockResolvedValue(response);

      const result = await controller.confirmLogin(dto, request);

      expect(authService.confirmLogin).toHaveBeenCalledWith(dto, request);
      expect(result).toBe(response);
    });
  });

  describe('resendLoginOtp', () => {
    it('delegates to AuthService.resendLoginOtp', async () => {
      const dto: ResendLoginOtpDto = { attemptId: 'attempt-1' };
      authService.resendLoginOtp.mockResolvedValue(pending);

      const result = await controller.resendLoginOtp(dto, request);

      expect(authService.resendLoginOtp).toHaveBeenCalledWith(dto, request);
      expect(result).toBe(pending);
    });
  });

  describe('refresh', () => {
    it('sets new cookies and returns the user without tokens rotated in the body', async () => {
      const reply = createReply();
      const tokens = { accessToken: 'new-access', refreshToken: 'new-refresh' };
      const user = { id: 'user-1', email: 'test@example.com' };
      authService.refresh.mockResolvedValue({ user, tokens });

      const result = await controller.refresh(
        request,
        reply as unknown as FastifyReply,
      );

      expect(authService.refresh).toHaveBeenCalledWith(request);
      expect(authCookieService.setAuthCookies).toHaveBeenCalledWith(
        reply,
        tokens,
      );
      expect(result).toEqual({
        accessToken: tokens.accessToken,
        user,
      });
    });
  });
});
