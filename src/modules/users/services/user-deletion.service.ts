import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import type { FastifyRequest } from 'fastify';
import { QueryFailedError, Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';

import { AuditLogService } from '@/core/audit-log/audit-log.service';
import { ConfigService } from '@/core/config/config.service';
import { MailerService } from '@/core/mailer/mailer.service';
import { PendingLoginAttempt } from '@/modules/auth/entities/pending-login-attempt.entity';
import { UserRole } from '@/modules/rbac/entities/user-role.entity';
import { RbacCacheService } from '@/modules/rbac/services/rbac-cache.service';
import { AccountDeletionPendingDto } from '@/modules/users/dtos/account-deletion-pending.dto';
import { PendingEmailChange } from '@/modules/users/entities/pending-email-change.entity';
import { PendingUserDeletion } from '@/modules/users/entities/pending-user-deletion.entity';
import { User } from '@/modules/users/entities/user.entity';
import { UsersService } from '@/modules/users/services/users.service';

type DeletionAccessType = 'self' | 'admin';

const INVALID_OR_EXPIRED_CODE_MESSAGE = 'Invalid or expired confirmation code';
const POSTGRES_UNIQUE_VIOLATION = '23505';

@Injectable()
export class UserDeletionService {
  constructor(
    @InjectRepository(PendingUserDeletion)
    private readonly pendingUserDeletionRepository: Repository<PendingUserDeletion>,
    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,
    @InjectRepository(PendingEmailChange)
    private readonly pendingEmailChangeRepository: Repository<PendingEmailChange>,
    @InjectRepository(PendingLoginAttempt)
    private readonly pendingLoginAttemptRepository: Repository<PendingLoginAttempt>,
    private readonly usersService: UsersService,
    private readonly mailerService: MailerService,
    private readonly auditLogService: AuditLogService,
    private readonly configService: ConfigService,
    private readonly rbacCacheService: RbacCacheService,
  ) {}

  @Transactional()
  async initiateSelfDeletion(
    user: User,
    reason: string | undefined,
    request?: FastifyRequest,
  ): Promise<AccountDeletionPendingDto> {
    const ttlMs = Number(this.configService.get('ACCOUNT_DELETION_OTP_TTL_MS'));
    const maxAttempts = Number(
      this.configService.get('ACCOUNT_DELETION_OTP_MAX_ATTEMPTS'),
    );
    const cooldownMs = Number(
      this.configService.get('ACCOUNT_DELETION_OTP_RESEND_COOLDOWN_MS'),
    );
    const now = new Date();

    const pending = await this.pendingUserDeletionRepository.findOne({
      where: { userId: user.id, status: 'PENDING' },
    });

    if (pending) {
      const resendAvailableAt = new Date(
        pending.lastSentAt.getTime() + cooldownMs,
      );

      if (now < resendAvailableAt) {
        await this.auditLogService.record({
          eventType: 'USER_DELETION_RESEND_REJECTED',
          userId: user.id,
          email: user.email,
          request,
          metadata: { attemptId: pending.id },
        });

        throw new HttpException(
          'Resend not available yet',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return this.reissue(
        pending,
        user.email,
        reason,
        ttlMs,
        cooldownMs,
        request,
      );
    }

    const code = this.generateOtpCode();
    const attempt = this.pendingUserDeletionRepository.create({
      userId: user.id,
      reason: reason ?? null,
      confirmationMethod: 'otp',
      codeHash: await this.hashCode(code),
      expiresAt: new Date(now.getTime() + ttlMs),
      attemptCount: 0,
      maxAttempts,
      status: 'PENDING',
      lastSentAt: now,
      ipAddress: request?.ip ?? null,
      userAgent: this.normalizeUserAgent(request?.headers['user-agent']),
    });

    let saved: PendingUserDeletion;

    try {
      saved = await this.pendingUserDeletionRepository.save(attempt);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'A deletion request is already in progress',
        );
      }

      throw error;
    }

    await this.mailerService.sendAccountDeletionOtpEmail({
      to: user.email,
      code,
      ttlMinutes: this.toMinutes(ttlMs),
    });

    await this.auditLogService.record({
      eventType: 'USER_DELETION_REQUESTED',
      userId: user.id,
      email: user.email,
      request,
      metadata: { attemptId: saved.id },
    });

    await this.auditLogService.record({
      eventType: 'USER_DELETION_OTP_SENT',
      userId: user.id,
      email: user.email,
      request,
      metadata: { attemptId: saved.id },
    });

    return AccountDeletionPendingDto.from(saved, cooldownMs);
  }

  // Not @Transactional(): a failed outcome's status flip + audit must
  // survive the throw (see the same reasoning on EmailChangeService.confirm()).
  async confirmSelfDeletion(
    userId: string,
    challengeId: string,
    code: string,
    request?: FastifyRequest,
  ): Promise<User> {
    const attempt = await this.findActiveChallengeOrThrow(
      challengeId,
      userId,
      request,
    );

    const isValid = await bcrypt.compare(code, attempt.codeHash);

    if (!isValid) {
      attempt.attemptCount += 1;

      if (attempt.attemptCount >= attempt.maxAttempts) {
        attempt.status = 'FAILED';
        await this.pendingUserDeletionRepository.save(attempt);

        await this.auditLogService.record({
          eventType: 'USER_DELETION_ATTEMPT_LOCKED',
          userId: attempt.userId,
          request,
          metadata: { attemptId: attempt.id },
        });
      } else {
        await this.pendingUserDeletionRepository.save(attempt);

        await this.auditLogService.record({
          eventType: 'USER_DELETION_OTP_VERIFICATION_FAILED',
          userId: attempt.userId,
          request,
          metadata: { attemptId: attempt.id },
        });
      }

      throw new UnauthorizedException(INVALID_OR_EXPIRED_CODE_MESSAGE);
    }

    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException(INVALID_OR_EXPIRED_CODE_MESSAGE);
    }

    return this.anonymize(user, userId, 'self', request, attempt);
  }

  async adminDelete(
    targetUser: User,
    actorUserId: string,
    request?: FastifyRequest,
  ): Promise<User> {
    const stray = await this.pendingUserDeletionRepository.findOne({
      where: { userId: targetUser.id, status: 'PENDING' },
    });

    if (stray) {
      stray.status = 'EXPIRED';
      await this.pendingUserDeletionRepository.save(stray);
    }

    return this.anonymize(targetUser, actorUserId, 'admin', request);
  }

  // Public wrapper: mutation runs inside a transaction, then the RBAC
  // cache is reloaded afterwards — mirrors UserRolesService.revokeRole().
  private async anonymize(
    user: User,
    actorUserId: string,
    accessType: DeletionAccessType,
    request?: FastifyRequest,
    confirmedRow?: PendingUserDeletion,
  ): Promise<User> {
    const saved = await this.persistAnonymize(
      user,
      actorUserId,
      accessType,
      request,
      confirmedRow,
    );

    await this.rbacCacheService.reload();

    return saved;
  }

  @Transactional()
  private async persistAnonymize(
    user: User,
    actorUserId: string,
    accessType: DeletionAccessType,
    request?: FastifyRequest,
    confirmedRow?: PendingUserDeletion,
  ): Promise<User> {
    await this.userRoleRepository.delete({ userId: user.id });
    await this.pendingEmailChangeRepository.delete({ userId: user.id });
    await this.pendingLoginAttemptRepository.delete({ userId: user.id });

    if (confirmedRow) {
      confirmedRow.status = 'CONFIRMED';
      confirmedRow.confirmedAt = new Date();
      await this.pendingUserDeletionRepository.save(confirmedRow);
    }

    const saltRounds = Number(this.configService.get('BCRYPT_SALT_ROUNDS'));

    user.status = 'DELETED';
    user.deletedAt = new Date();
    user.email = `deleted-${user.id}@deleted.invalid`;
    user.passwordHash = await bcrypt.hash(
      crypto.randomBytes(32).toString('hex'),
      saltRounds,
    );
    user.firstName = null;
    user.lastName = null;
    user.photo = null;

    const savedUser = await this.usersService.save(user);

    await this.auditLogService.record({
      eventType: accessType === 'self' ? 'USER_DELETED' : 'ADMIN_USER_DELETED',
      userId: actorUserId,
      request,
      metadata: { targetUserId: user.id, accessType },
    });

    return savedUser;
  }

  // Reissue path for an existing PENDING row past its resend cooldown,
  // mirroring EmailChangeService.initiate()'s reissue().
  private async reissue(
    pending: PendingUserDeletion,
    email: string,
    reason: string | undefined,
    ttlMs: number,
    cooldownMs: number,
    request?: FastifyRequest,
  ): Promise<AccountDeletionPendingDto> {
    const now = new Date();
    const code = this.generateOtpCode();

    if (reason !== undefined) {
      pending.reason = reason;
    }

    pending.codeHash = await this.hashCode(code);
    pending.expiresAt = new Date(now.getTime() + ttlMs);
    pending.lastSentAt = now;

    const saved = await this.pendingUserDeletionRepository.save(pending);

    await this.mailerService.sendAccountDeletionOtpEmail({
      to: email,
      code,
      ttlMinutes: this.toMinutes(ttlMs),
    });

    await this.auditLogService.record({
      eventType: 'USER_DELETION_OTP_SENT',
      userId: pending.userId,
      request,
      metadata: { attemptId: saved.id },
    });

    return AccountDeletionPendingDto.from(saved, cooldownMs);
  }

  private async findActiveChallengeOrThrow(
    challengeId: string,
    userId: string,
    request?: FastifyRequest,
  ): Promise<PendingUserDeletion> {
    const attempt = await this.pendingUserDeletionRepository.findOne({
      where: { id: challengeId },
    });

    if (!attempt || attempt.userId !== userId || attempt.status !== 'PENDING') {
      throw new UnauthorizedException(INVALID_OR_EXPIRED_CODE_MESSAGE);
    }

    if (attempt.expiresAt < new Date()) {
      attempt.status = 'EXPIRED';
      await this.pendingUserDeletionRepository.save(attempt);

      await this.auditLogService.record({
        eventType: 'USER_DELETION_EXPIRED',
        userId: attempt.userId,
        request,
        metadata: { attemptId: attempt.id },
      });

      throw new UnauthorizedException(INVALID_OR_EXPIRED_CODE_MESSAGE);
    }

    return attempt;
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    return (
      (error.driverError as { code?: string } | undefined)?.code ===
      POSTGRES_UNIQUE_VIOLATION
    );
  }

  private generateOtpCode(): string {
    const length = Number(
      this.configService.get('ACCOUNT_DELETION_OTP_LENGTH'),
    );
    const max = 10 ** length;

    return crypto.randomInt(0, max).toString().padStart(length, '0');
  }

  private async hashCode(code: string): Promise<string> {
    const saltRounds = Number(this.configService.get('BCRYPT_SALT_ROUNDS'));
    return bcrypt.hash(code, saltRounds);
  }

  private toMinutes(ms: number): number {
    return Math.round(ms / 60_000);
  }

  private normalizeUserAgent(
    value: string | string[] | undefined,
  ): string | null {
    if (!value) {
      return null;
    }

    return Array.isArray(value) ? (value[0] ?? null) : value;
  }
}
