jest.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));
jest.mock('bcrypt');
jest.mock('crypto', () => ({
  ...jest.requireActual<typeof import('crypto')>('crypto'),
  randomInt: jest.fn(),
}));

import {
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { FastifyRequest } from 'fastify';

import { AuditLogService } from '@/core/audit-log/audit-log.service';
import { ConfigService } from '@/core/config/config.service';
import { PendingLoginAttempt } from '@/modules/auth/entities/pending-login-attempt.entity';
import { LoginOtpService } from '@/modules/auth/services/login-otp.service';
import { User } from '@/modules/users/entities/user.entity';
import { UsersService } from '@/modules/users/services/users.service';
import { MailerService } from '@/core/mailer/mailer.service';

describe('LoginOtpService', () => {
  let service: LoginOtpService;
  let repository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };
  let usersService: { findById: jest.Mock };
  let mailerService: { sendLoginOtpEmail: jest.Mock };
  let auditLogService: { record: jest.Mock };

  const now = new Date('2026-01-01T00:00:00.000Z');
  const request = { ip: '127.0.0.1', headers: {} } as FastifyRequest;
  const user = { id: 'user-1', email: 'test@example.com' } as User;

  const configValues: Record<string, string> = {
    LOGIN_OTP_TTL_MS: '600000',
    LOGIN_OTP_MAX_ATTEMPTS: '5',
    LOGIN_OTP_RESEND_COOLDOWN_MS: '60000',
    LOGIN_OTP_LENGTH: '6',
    BCRYPT_SALT_ROUNDS: '4',
  };

  const buildAttempt = (
    overrides: Partial<PendingLoginAttempt> = {},
  ): PendingLoginAttempt =>
    ({
      id: 'attempt-1',
      userId: user.id,
      email: user.email,
      confirmationMethod: 'otp',
      codeHash: 'hashed-otp',
      expiresAt: new Date(now.getTime() + 600_000),
      attemptCount: 0,
      maxAttempts: 5,
      status: 'PENDING',
      lastSentAt: now,
      confirmedAt: null,
      ipAddress: null,
      userAgent: null,
      ...overrides,
    }) as PendingLoginAttempt;

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(now);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoginOtpService,
        {
          provide: getRepositoryToken(PendingLoginAttempt),
          useValue: { create: jest.fn(), save: jest.fn(), findOne: jest.fn() },
        },
        {
          provide: UsersService,
          useValue: { findById: jest.fn() },
        },
        {
          provide: MailerService,
          useValue: { sendLoginOtpEmail: jest.fn() },
        },
        {
          provide: AuditLogService,
          useValue: { record: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => configValues[key]) },
        },
      ],
    }).compile();

    service = module.get<LoginOtpService>(LoginOtpService);
    repository = module.get(getRepositoryToken(PendingLoginAttempt));
    usersService = module.get(UsersService);
    mailerService = module.get(MailerService);
    auditLogService = module.get(AuditLogService);

    (crypto.randomInt as jest.Mock).mockReturnValue(42);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-otp');
    repository.create.mockImplementation(
      (data: Partial<PendingLoginAttempt>) => data as PendingLoginAttempt,
    );
    repository.save.mockImplementation(
      (attempt: Partial<PendingLoginAttempt>) =>
        Promise.resolve({ id: 'attempt-1', ...attempt } as PendingLoginAttempt),
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('initiate', () => {
    it('creates a pending attempt, sends the OTP email, records LOGIN_OTP_SENT and returns the pending dto', async () => {
      const result = await service.initiate(user, request);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          email: user.email,
          confirmationMethod: 'otp',
          codeHash: 'hashed-otp',
          expiresAt: new Date(now.getTime() + 600_000),
          attemptCount: 0,
          maxAttempts: 5,
          status: 'PENDING',
          lastSentAt: now,
        }),
      );
      expect(mailerService.sendLoginOtpEmail).toHaveBeenCalledWith({
        to: user.email,
        code: '000042',
        ttlMinutes: 10,
      });
      expect(auditLogService.record).toHaveBeenCalledWith({
        eventType: 'LOGIN_OTP_SENT',
        userId: user.id,
        email: user.email,
        request,
        metadata: { attemptId: 'attempt-1' },
      });
      expect(result).toEqual({
        attemptId: 'attempt-1',
        confirmationMethod: 'otp',
        expiresAt: new Date(now.getTime() + 600_000),
        resendAvailableAt: new Date(now.getTime() + 60_000),
      });
    });
  });

  describe('resend', () => {
    it('rejects and records LOGIN_OTP_RESEND_REJECTED when the cooldown has not elapsed', async () => {
      const attempt = buildAttempt({ lastSentAt: now });
      repository.findOne.mockResolvedValue(attempt);
      jest.setSystemTime(new Date(now.getTime() + 30_000));

      const error: unknown = await service
        .resend(attempt.id, request)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect(auditLogService.record).toHaveBeenCalledWith({
        eventType: 'LOGIN_OTP_RESEND_REJECTED',
        userId: attempt.userId,
        email: attempt.email,
        request,
        metadata: { attemptId: attempt.id },
      });
      expect(mailerService.sendLoginOtpEmail).not.toHaveBeenCalled();
    });

    it('issues a new code, sends the email and records LOGIN_OTP_RESENT once the cooldown has elapsed', async () => {
      const attempt = buildAttempt({ lastSentAt: now });
      repository.findOne.mockResolvedValue(attempt);
      const resendTime = new Date(now.getTime() + 61_000);
      jest.setSystemTime(resendTime);

      const result = await service.resend(attempt.id, request);

      expect(mailerService.sendLoginOtpEmail).toHaveBeenCalledWith({
        to: attempt.email,
        code: '000042',
        ttlMinutes: 10,
      });
      expect(auditLogService.record).toHaveBeenCalledWith({
        eventType: 'LOGIN_OTP_RESENT',
        userId: attempt.userId,
        email: attempt.email,
        request,
        metadata: { attemptId: attempt.id },
      });
      expect(result).toEqual({
        attemptId: attempt.id,
        confirmationMethod: 'otp',
        expiresAt: new Date(resendTime.getTime() + 600_000),
        resendAvailableAt: new Date(resendTime.getTime() + 60_000),
      });
    });

    it('throws unauthorized when the attempt does not exist', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.resend('missing-attempt', request),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('expires and rejects an attempt whose TTL has elapsed', async () => {
      const attempt = buildAttempt({
        expiresAt: new Date(now.getTime() - 1),
      });
      repository.findOne.mockResolvedValue(attempt);

      await expect(service.resend(attempt.id, request)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'EXPIRED' }),
      );
    });
  });

  describe('confirm', () => {
    it('increments attemptCount and records LOGIN_OTP_VERIFICATION_FAILED on a wrong code below the lockout threshold', async () => {
      const attempt = buildAttempt({ attemptCount: 1, maxAttempts: 5 });
      repository.findOne.mockResolvedValue(attempt);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.confirm(attempt.id, '000000', request),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ attemptCount: 2, status: 'PENDING' }),
      );
      expect(auditLogService.record).toHaveBeenCalledWith({
        eventType: 'LOGIN_OTP_VERIFICATION_FAILED',
        userId: attempt.userId,
        email: attempt.email,
        request,
        metadata: { attemptId: attempt.id },
      });
    });

    it('locks the attempt and records LOGIN_ATTEMPT_LOCKED once maxAttempts is reached', async () => {
      const attempt = buildAttempt({ attemptCount: 4, maxAttempts: 5 });
      repository.findOne.mockResolvedValue(attempt);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.confirm(attempt.id, '000000', request),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ attemptCount: 5, status: 'FAILED' }),
      );
      expect(auditLogService.record).toHaveBeenCalledWith({
        eventType: 'LOGIN_ATTEMPT_LOCKED',
        userId: attempt.userId,
        email: attempt.email,
        request,
        metadata: { attemptId: attempt.id },
      });
    });

    it('confirms the attempt and returns the user on a correct code', async () => {
      const attempt = buildAttempt();
      repository.findOne.mockResolvedValue(attempt);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      usersService.findById.mockResolvedValue(user);

      const result = await service.confirm(attempt.id, '000042', request);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'CONFIRMED', confirmedAt: now }),
      );
      expect(usersService.findById).toHaveBeenCalledWith(attempt.userId);
      expect(result).toBe(user);
    });

    it('throws unauthorized when the confirmed attempt no longer has a matching user', async () => {
      const attempt = buildAttempt();
      repository.findOne.mockResolvedValue(attempt);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      usersService.findById.mockResolvedValue(null);

      await expect(
        service.confirm(attempt.id, '000042', request),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws unauthorized when the attempt is not pending', async () => {
      const attempt = buildAttempt({ status: 'CONFIRMED' });
      repository.findOne.mockResolvedValue(attempt);

      await expect(
        service.confirm(attempt.id, '000042', request),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });
  });
});
