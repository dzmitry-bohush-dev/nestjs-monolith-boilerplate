jest.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));
jest.mock('bcrypt');
jest.mock('crypto', () => ({
  ...jest.requireActual<typeof import('crypto')>('crypto'),
  randomInt: jest.fn(),
  randomBytes: jest.fn(),
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
import { PendingLoginAttempt } from '@/modules/auth/entities/pending-login-attempt.entity';
import { UserRole } from '@/modules/rbac/entities/user-role.entity';
import { RbacCacheService } from '@/modules/rbac/services/rbac-cache.service';
import { PendingEmailChange } from '@/modules/users/entities/pending-email-change.entity';
import { PendingUserDeletion } from '@/modules/users/entities/pending-user-deletion.entity';
import { User } from '@/modules/users/entities/user.entity';
import { UserDeletionService } from '@/modules/users/services/user-deletion.service';
import { UsersService } from '@/modules/users/services/users.service';

describe('UserDeletionService', () => {
  let service: UserDeletionService;
  let repository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };
  let userRoleRepository: { delete: jest.Mock };
  let pendingEmailChangeRepository: { delete: jest.Mock };
  let pendingLoginAttemptRepository: { delete: jest.Mock };
  let usersService: { findById: jest.Mock; save: jest.Mock };
  let mailerService: { sendAccountDeletionOtpEmail: jest.Mock };
  let auditLogService: { record: jest.Mock };
  let rbacCacheService: { reload: jest.Mock };

  const now = new Date('2026-01-01T00:00:00.000Z');
  const request = { ip: '127.0.0.1', headers: {} } as FastifyRequest;
  const user = { id: 'user-1', email: 'current@example.com' } as User;

  const configValues: Record<string, string> = {
    ACCOUNT_DELETION_OTP_TTL_MS: '600000',
    ACCOUNT_DELETION_OTP_MAX_ATTEMPTS: '5',
    ACCOUNT_DELETION_OTP_RESEND_COOLDOWN_MS: '60000',
    ACCOUNT_DELETION_OTP_LENGTH: '6',
    BCRYPT_SALT_ROUNDS: '4',
  };

  const buildAttempt = (
    overrides: Partial<PendingUserDeletion> = {},
  ): PendingUserDeletion =>
    ({
      id: 'attempt-1',
      userId: user.id,
      reason: null,
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
    }) as PendingUserDeletion;

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(now);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserDeletionService,
        {
          provide: getRepositoryToken(PendingUserDeletion),
          useValue: { create: jest.fn(), save: jest.fn(), findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(UserRole),
          useValue: { delete: jest.fn() },
        },
        {
          provide: getRepositoryToken(PendingEmailChange),
          useValue: { delete: jest.fn() },
        },
        {
          provide: getRepositoryToken(PendingLoginAttempt),
          useValue: { delete: jest.fn() },
        },
        {
          provide: UsersService,
          useValue: { findById: jest.fn(), save: jest.fn() },
        },
        {
          provide: MailerService,
          useValue: { sendAccountDeletionOtpEmail: jest.fn() },
        },
        {
          provide: AuditLogService,
          useValue: { record: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => configValues[key]) },
        },
        {
          provide: RbacCacheService,
          useValue: { reload: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<UserDeletionService>(UserDeletionService);
    repository = module.get(getRepositoryToken(PendingUserDeletion));
    userRoleRepository = module.get(getRepositoryToken(UserRole));
    pendingEmailChangeRepository = module.get(
      getRepositoryToken(PendingEmailChange),
    );
    pendingLoginAttemptRepository = module.get(
      getRepositoryToken(PendingLoginAttempt),
    );
    usersService = module.get(UsersService);
    mailerService = module.get(MailerService);
    auditLogService = module.get(AuditLogService);
    rbacCacheService = module.get(RbacCacheService);

    (crypto.randomInt as jest.Mock).mockReturnValue(42);
    (crypto.randomBytes as jest.Mock).mockReturnValue(
      Buffer.from('deterministic-random-bytes'),
    );
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-otp');
    repository.create.mockImplementation(
      (data: Partial<PendingUserDeletion>) => data as PendingUserDeletion,
    );
    repository.save.mockImplementation(
      (attempt: Partial<PendingUserDeletion>) =>
        Promise.resolve({
          id: 'attempt-1',
          ...attempt,
        } as PendingUserDeletion),
    );
    usersService.save.mockImplementation((u: User) => Promise.resolve(u));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('initiateSelfDeletion', () => {
    it('creates a pending row, sends the OTP email and records both audit events on the happy path', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.initiateSelfDeletion(
        user,
        'no longer needed',
        request,
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          reason: 'no longer needed',
          confirmationMethod: 'otp',
          codeHash: 'hashed-otp',
          expiresAt: new Date(now.getTime() + 600_000),
          attemptCount: 0,
          maxAttempts: 5,
          status: 'PENDING',
          lastSentAt: now,
        }),
      );
      expect(mailerService.sendAccountDeletionOtpEmail).toHaveBeenCalledWith({
        to: user.email,
        code: '000042',
        ttlMinutes: 10,
      });
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'USER_DELETION_REQUESTED',
          userId: user.id,
        }),
      );
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'USER_DELETION_OTP_SENT',
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

    it('rejects and records USER_DELETION_RESEND_REJECTED when an existing pending row is within cooldown', async () => {
      const pending = buildAttempt({ lastSentAt: now });
      repository.findOne.mockResolvedValue(pending);
      jest.setSystemTime(new Date(now.getTime() + 30_000));

      const error: unknown = await service
        .initiateSelfDeletion(user, undefined, request)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'USER_DELETION_RESEND_REJECTED',
          metadata: { attemptId: pending.id },
        }),
      );
      expect(mailerService.sendAccountDeletionOtpEmail).not.toHaveBeenCalled();
    });

    it('reissues the existing pending row once the cooldown has elapsed', async () => {
      const pending = buildAttempt({ lastSentAt: now });
      repository.findOne.mockResolvedValue(pending);
      const resendTime = new Date(now.getTime() + 61_000);
      jest.setSystemTime(resendTime);

      const result = await service.initiateSelfDeletion(
        user,
        'changed my mind',
        request,
      );

      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: pending.id,
          reason: 'changed my mind',
          codeHash: 'hashed-otp',
        }),
      );
      expect(mailerService.sendAccountDeletionOtpEmail).toHaveBeenCalledWith({
        to: user.email,
        code: '000042',
        ttlMinutes: 10,
      });
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'USER_DELETION_OTP_SENT' }),
      );
      expect(result.challengeId).toBe(pending.id);
    });

    it('treats a unique-violation on insert as an already-pending conflict (409)', async () => {
      repository.findOne.mockResolvedValue(null);
      const driverError = Object.assign(new Error('duplicate key'), {
        code: '23505',
      });
      repository.save.mockRejectedValueOnce(
        new QueryFailedError('INSERT', [], driverError),
      );

      const error: unknown = await service
        .initiateSelfDeletion(user, undefined, request)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ConflictException);
      expect(mailerService.sendAccountDeletionOtpEmail).not.toHaveBeenCalled();
    });
  });

  describe('confirmSelfDeletion', () => {
    it('throws a generic UnauthorizedException when the challenge belongs to another user', async () => {
      const attempt = buildAttempt({ userId: 'someone-else' });
      repository.findOne.mockResolvedValue(attempt);

      await expect(
        service.confirmSelfDeletion(user.id, attempt.id, '000042', request),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('expires and records USER_DELETION_EXPIRED when the TTL has elapsed', async () => {
      const attempt = buildAttempt({
        expiresAt: new Date(now.getTime() - 1),
      });
      repository.findOne.mockResolvedValue(attempt);

      await expect(
        service.confirmSelfDeletion(user.id, attempt.id, '000042', request),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'EXPIRED' }),
      );
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'USER_DELETION_EXPIRED' }),
      );
    });

    it('increments attemptCount and records USER_DELETION_OTP_VERIFICATION_FAILED on a wrong code below the lockout threshold', async () => {
      const attempt = buildAttempt({ attemptCount: 1, maxAttempts: 5 });
      repository.findOne.mockResolvedValue(attempt);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.confirmSelfDeletion(user.id, attempt.id, '000000', request),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ attemptCount: 2, status: 'PENDING' }),
      );
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'USER_DELETION_OTP_VERIFICATION_FAILED',
        }),
      );
      expect(usersService.save).not.toHaveBeenCalled();
    });

    it('locks the attempt and records USER_DELETION_ATTEMPT_LOCKED once maxAttempts is reached', async () => {
      const attempt = buildAttempt({ attemptCount: 4, maxAttempts: 5 });
      repository.findOne.mockResolvedValue(attempt);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.confirmSelfDeletion(user.id, attempt.id, '000000', request),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ attemptCount: 5, status: 'FAILED' }),
      );
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'USER_DELETION_ATTEMPT_LOCKED' }),
      );
    });

    it('anonymizes the user, purges related rows, confirms the attempt and records USER_DELETED on success', async () => {
      const attempt = buildAttempt();
      repository.findOne.mockResolvedValue(attempt);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const targetUser = {
        id: user.id,
        email: 'current@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        photo: 'photo-url',
      } as User;
      usersService.findById.mockResolvedValue(targetUser);

      const result = await service.confirmSelfDeletion(
        user.id,
        attempt.id,
        '000042',
        request,
      );

      expect(userRoleRepository.delete).toHaveBeenCalledWith({
        userId: user.id,
      });
      expect(pendingEmailChangeRepository.delete).toHaveBeenCalledWith({
        userId: user.id,
      });
      expect(pendingLoginAttemptRepository.delete).toHaveBeenCalledWith({
        userId: user.id,
      });
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'CONFIRMED', confirmedAt: now }),
      );
      expect(usersService.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'DELETED',
          deletedAt: now,
          email: `deleted-${user.id}@deleted.invalid`,
          firstName: null,
          lastName: null,
          photo: null,
        }),
      );
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'USER_DELETED',
          userId: user.id,
          metadata: { targetUserId: user.id, accessType: 'self' },
        }),
      );
      expect(rbacCacheService.reload).toHaveBeenCalled();
      expect(result.status).toBe('DELETED');
      expect(result.email).toBe(`deleted-${user.id}@deleted.invalid`);
    });
  });

  describe('adminDelete', () => {
    it('expires a stray pending row and anonymizes the target user without an OTP step', async () => {
      const stray = buildAttempt();
      repository.findOne.mockResolvedValue(stray);
      const targetUser = {
        id: 'target-user',
        email: 'target@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        photo: 'photo-url',
      } as User;

      const result = await service.adminDelete(
        targetUser,
        'admin-user',
        request,
      );

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: stray.id, status: 'EXPIRED' }),
      );
      expect(userRoleRepository.delete).toHaveBeenCalledWith({
        userId: targetUser.id,
      });
      expect(usersService.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'DELETED',
          email: `deleted-${targetUser.id}@deleted.invalid`,
        }),
      );
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'ADMIN_USER_DELETED',
          userId: 'admin-user',
          metadata: { targetUserId: targetUser.id, accessType: 'admin' },
        }),
      );
      expect(rbacCacheService.reload).toHaveBeenCalled();
      expect(result.status).toBe('DELETED');
    });

    it('does nothing to pending_user_deletions when there is no stray pending row', async () => {
      repository.findOne.mockResolvedValue(null);
      const targetUser = {
        id: 'target-user',
        email: 'target@example.com',
        firstName: null,
        lastName: null,
        photo: null,
      } as User;

      await service.adminDelete(targetUser, 'admin-user', request);

      expect(repository.save).not.toHaveBeenCalled();
    });
  });
});
