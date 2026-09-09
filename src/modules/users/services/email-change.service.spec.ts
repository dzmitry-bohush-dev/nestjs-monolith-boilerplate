jest.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));
jest.mock('bcrypt');
jest.mock('crypto', () => ({
  ...jest.requireActual<typeof import('crypto')>('crypto'),
  randomInt: jest.fn(),
}));

import {
  ConflictException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { FastifyRequest } from 'fastify';
import { QueryFailedError } from 'typeorm';

import { AuditLogService } from '@/core/audit-log/audit-log.service';
import { ConfigService } from '@/core/config/config.service';
import { MailerService } from '@/core/mailer/mailer.service';
import { EmailChangeService } from '@/modules/users/services/email-change.service';
import { PendingEmailChange } from '@/modules/users/entities/pending-email-change.entity';
import { User } from '@/modules/users/entities/user.entity';
import { UsersService } from '@/modules/users/services/users.service';

describe('EmailChangeService', () => {
  let service: EmailChangeService;
  let repository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };
  let usersService: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    save: jest.Mock;
  };
  let mailerService: { sendEmailChangeOtpEmail: jest.Mock };
  let auditLogService: { record: jest.Mock };

  const now = new Date('2026-01-01T00:00:00.000Z');
  const request = { ip: '127.0.0.1', headers: {} } as FastifyRequest;
  const user = { id: 'user-1', email: 'current@example.com' } as User;

  const configValues: Record<string, string> = {
    EMAIL_CHANGE_OTP_TTL_MS: '600000',
    EMAIL_CHANGE_OTP_MAX_ATTEMPTS: '5',
    EMAIL_CHANGE_OTP_RESEND_COOLDOWN_MS: '60000',
    EMAIL_CHANGE_OTP_LENGTH: '6',
    BCRYPT_SALT_ROUNDS: '4',
  };

  const buildAttempt = (
    overrides: Partial<PendingEmailChange> = {},
  ): PendingEmailChange =>
    ({
      id: 'attempt-1',
      userId: user.id,
      newEmail: 'new@example.com',
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
    }) as PendingEmailChange;

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(now);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailChangeService,
        {
          provide: getRepositoryToken(PendingEmailChange),
          useValue: { create: jest.fn(), save: jest.fn(), findOne: jest.fn() },
        },
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            findById: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: MailerService,
          useValue: { sendEmailChangeOtpEmail: jest.fn() },
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

    service = module.get<EmailChangeService>(EmailChangeService);
    repository = module.get(getRepositoryToken(PendingEmailChange));
    usersService = module.get(UsersService);
    mailerService = module.get(MailerService);
    auditLogService = module.get(AuditLogService);

    (crypto.randomInt as jest.Mock).mockReturnValue(42);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-otp');
    repository.create.mockImplementation(
      (data: Partial<PendingEmailChange>) => data as PendingEmailChange,
    );
    repository.save.mockImplementation((attempt: Partial<PendingEmailChange>) =>
      Promise.resolve({
        id: 'attempt-1',
        ...attempt,
      } as PendingEmailChange),
    );
    usersService.findByEmail.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('initiate', () => {
    it('throws ConflictException when newEmail is already taken by another user', async () => {
      usersService.findByEmail.mockResolvedValue({
        id: 'other-user',
        email: 'new@example.com',
      } as User);
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.initiate(user, 'new@example.com', request),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(repository.save).not.toHaveBeenCalled();
    });

    it('creates a pending row, sends the OTP email and records both audit events on the happy path', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.initiate(user, 'new@example.com', request);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          newEmail: 'new@example.com',
          confirmationMethod: 'otp',
          codeHash: 'hashed-otp',
          expiresAt: new Date(now.getTime() + 600_000),
          attemptCount: 0,
          maxAttempts: 5,
          status: 'PENDING',
          lastSentAt: now,
        }),
      );
      expect(mailerService.sendEmailChangeOtpEmail).toHaveBeenCalledWith({
        to: 'new@example.com',
        code: '000042',
        ttlMinutes: 10,
        newEmail: 'new@example.com',
      });
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'EMAIL_CHANGE_INITIATED',
          userId: user.id,
        }),
      );
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'EMAIL_CHANGE_OTP_SENT',
          userId: user.id,
        }),
      );
      expect(result).toEqual({
        challengeId: 'attempt-1',
        requiresConfirmation: true,
        confirmationMethod: 'otp',
        expiresAt: new Date(now.getTime() + 600_000),
        resendAvailableAt: new Date(now.getTime() + 60_000),
      });
    });

    it('rejects and records EMAIL_CHANGE_RESEND_REJECTED when an existing pending row is within cooldown', async () => {
      const pending = buildAttempt({ lastSentAt: now });
      repository.findOne.mockResolvedValue(pending);
      jest.setSystemTime(new Date(now.getTime() + 30_000));

      const error: unknown = await service
        .initiate(user, 'new@example.com', request)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'EMAIL_CHANGE_RESEND_REJECTED',
          metadata: { attemptId: pending.id },
        }),
      );
      expect(mailerService.sendEmailChangeOtpEmail).not.toHaveBeenCalled();
    });

    it('reissues the existing pending row once the cooldown has elapsed', async () => {
      const pending = buildAttempt({ lastSentAt: now });
      repository.findOne.mockResolvedValue(pending);
      const resendTime = new Date(now.getTime() + 61_000);
      jest.setSystemTime(resendTime);

      const result = await service.initiate(user, 'newer@example.com', request);

      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: pending.id,
          newEmail: 'newer@example.com',
          codeHash: 'hashed-otp',
        }),
      );
      expect(mailerService.sendEmailChangeOtpEmail).toHaveBeenCalledWith({
        to: 'newer@example.com',
        code: '000042',
        ttlMinutes: 10,
        newEmail: 'newer@example.com',
      });
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'EMAIL_CHANGE_OTP_SENT' }),
      );
      expect(result.challengeId).toBe(pending.id);
    });

    it('starts a new pending row when the only prior attempt is locked out (FAILED)', async () => {
      // The lookup filters on status: 'PENDING', so a FAILED row from a prior
      // lockout is invisible here and does not block a fresh initiate().
      repository.findOne.mockResolvedValue(null);

      const result = await service.initiate(user, 'new@example.com', request);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { userId: user.id, status: 'PENDING' },
      });
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'PENDING' }),
      );
      expect(result.challengeId).toBe('attempt-1');
    });

    it('treats a unique-violation on insert as an already-pending conflict', async () => {
      repository.findOne.mockResolvedValue(null);
      const driverError = Object.assign(new Error('duplicate key'), {
        code: '23505',
      });
      repository.save.mockRejectedValueOnce(
        new QueryFailedError('INSERT', [], driverError),
      );

      const error: unknown = await service
        .initiate(user, 'new@example.com', request)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect(mailerService.sendEmailChangeOtpEmail).not.toHaveBeenCalled();
    });
  });

  describe('confirm', () => {
    it('throws a generic UnauthorizedException when the challenge belongs to another user', async () => {
      const attempt = buildAttempt({ userId: 'someone-else' });
      repository.findOne.mockResolvedValue(attempt);

      await expect(
        service.confirm(user.id, attempt.id, '000042', request),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('expires and records EMAIL_CHANGE_EXPIRED when the TTL has elapsed', async () => {
      const attempt = buildAttempt({
        expiresAt: new Date(now.getTime() - 1),
      });
      repository.findOne.mockResolvedValue(attempt);

      await expect(
        service.confirm(user.id, attempt.id, '000042', request),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'EXPIRED' }),
      );
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'EMAIL_CHANGE_EXPIRED' }),
      );
    });

    it('increments attemptCount and records EMAIL_CHANGE_OTP_VERIFICATION_FAILED on a wrong code below the lockout threshold', async () => {
      const attempt = buildAttempt({ attemptCount: 1, maxAttempts: 5 });
      repository.findOne.mockResolvedValue(attempt);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.confirm(user.id, attempt.id, '000000', request),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ attemptCount: 2, status: 'PENDING' }),
      );
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'EMAIL_CHANGE_OTP_VERIFICATION_FAILED',
        }),
      );
    });

    it('locks the attempt and records EMAIL_CHANGE_ATTEMPT_LOCKED once maxAttempts is reached', async () => {
      const attempt = buildAttempt({ attemptCount: 4, maxAttempts: 5 });
      repository.findOne.mockResolvedValue(attempt);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.confirm(user.id, attempt.id, '000000', request),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ attemptCount: 5, status: 'FAILED' }),
      );
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'EMAIL_CHANGE_ATTEMPT_LOCKED' }),
      );
    });

    it('throws ConflictException and flips to FAILED when newEmail was taken between initiate and confirm', async () => {
      const attempt = buildAttempt();
      repository.findOne.mockResolvedValue(attempt);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      usersService.findByEmail.mockResolvedValue({
        id: 'other-user',
        email: attempt.newEmail,
      } as User);

      await expect(
        service.confirm(user.id, attempt.id, '000042', request),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'FAILED' }),
      );
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'EMAIL_CHANGE_FAILED' }),
      );
      expect(usersService.save).not.toHaveBeenCalled();
    });

    it('updates the user email, confirms the attempt and records EMAIL_CHANGE_CONFIRMED on success', async () => {
      const attempt = buildAttempt();
      repository.findOne.mockResolvedValue(attempt);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      usersService.findByEmail.mockResolvedValue(null);
      const targetUser = { id: user.id, email: 'current@example.com' } as User;
      usersService.findById.mockResolvedValue(targetUser);
      usersService.save.mockImplementation((u: User) => Promise.resolve(u));

      const result = await service.confirm(
        user.id,
        attempt.id,
        '000042',
        request,
      );

      expect(usersService.save).toHaveBeenCalledWith(
        expect.objectContaining({ email: attempt.newEmail }),
      );
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'CONFIRMED', confirmedAt: now }),
      );
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'EMAIL_CHANGE_CONFIRMED' }),
      );
      expect(result.email).toBe(attempt.newEmail);
    });
  });
});
