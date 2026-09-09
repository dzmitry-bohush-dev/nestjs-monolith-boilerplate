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
import { EmailChangePendingDto } from '@/modules/users/dtos/email-change-pending.dto';
import { PendingEmailChange } from '@/modules/users/entities/pending-email-change.entity';
import { User } from '@/modules/users/entities/user.entity';
import { UsersService } from '@/modules/users/services/users.service';

const INVALID_OR_EXPIRED_CODE_MESSAGE = 'Invalid or expired confirmation code';
const POSTGRES_UNIQUE_VIOLATION = '23505';

@Injectable()
export class EmailChangeService {
  constructor(
    @InjectRepository(PendingEmailChange)
    private readonly pendingEmailChangeRepository: Repository<PendingEmailChange>,
    private readonly usersService: UsersService,
    private readonly mailerService: MailerService,
    private readonly auditLogService: AuditLogService,
    private readonly configService: ConfigService,
  ) {}

  @Transactional()
  async initiate(
    user: User,
    newEmail: string,
    request?: FastifyRequest,
  ): Promise<EmailChangePendingDto> {
    const existing = await this.usersService.findByEmail(newEmail);

    if (existing && existing.id !== user.id) {
      throw new ConflictException('Email already in use');
    }

    const ttlMs = Number(this.configService.get('EMAIL_CHANGE_OTP_TTL_MS'));
    const maxAttempts = Number(
      this.configService.get('EMAIL_CHANGE_OTP_MAX_ATTEMPTS'),
    );
    const cooldownMs = Number(
      this.configService.get('EMAIL_CHANGE_OTP_RESEND_COOLDOWN_MS'),
    );
    const now = new Date();

    const pending = await this.pendingEmailChangeRepository.findOne({
      where: { userId: user.id, status: 'PENDING' },
    });

    if (pending) {
      const resendAvailableAt = new Date(
        pending.lastSentAt.getTime() + cooldownMs,
      );

      if (now < resendAvailableAt) {
        await this.auditLogService.record({
          eventType: 'EMAIL_CHANGE_RESEND_REJECTED',
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

      return this.reissue(pending, newEmail, ttlMs, cooldownMs, request);
    }

    const code = this.generateOtpCode();
    const attempt = this.pendingEmailChangeRepository.create({
      userId: user.id,
      newEmail,
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

    let saved: PendingEmailChange;

    try {
      saved = await this.pendingEmailChangeRepository.save(attempt);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new HttpException(
          'An email change is already pending',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      throw error;
    }

    await this.mailerService.sendEmailChangeOtpEmail({
      to: newEmail,
      code,
      ttlMinutes: this.toMinutes(ttlMs),
      newEmail,
    });

    await this.auditLogService.record({
      eventType: 'EMAIL_CHANGE_INITIATED',
      userId: user.id,
      email: user.email,
      request,
      metadata: { attemptId: saved.id },
    });

    await this.auditLogService.record({
      eventType: 'EMAIL_CHANGE_OTP_SENT',
      userId: user.id,
      email: user.email,
      request,
      metadata: { attemptId: saved.id },
    });

    return EmailChangePendingDto.from(saved, cooldownMs);
  }

  // Not @Transactional(): a failed outcome's status flip + audit must
  // survive the throw (see the same reasoning on LoginOtpService.confirm()).
  async confirm(
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
        await this.pendingEmailChangeRepository.save(attempt);

        await this.auditLogService.record({
          eventType: 'EMAIL_CHANGE_ATTEMPT_LOCKED',
          userId: attempt.userId,
          request,
          metadata: { attemptId: attempt.id },
        });
      } else {
        await this.pendingEmailChangeRepository.save(attempt);

        await this.auditLogService.record({
          eventType: 'EMAIL_CHANGE_OTP_VERIFICATION_FAILED',
          userId: attempt.userId,
          request,
          metadata: { attemptId: attempt.id },
        });
      }

      throw new UnauthorizedException(INVALID_OR_EXPIRED_CODE_MESSAGE);
    }

    const conflicting = await this.usersService.findByEmail(attempt.newEmail);

    if (conflicting && conflicting.id !== userId) {
      attempt.status = 'FAILED';
      await this.pendingEmailChangeRepository.save(attempt);

      await this.auditLogService.record({
        eventType: 'EMAIL_CHANGE_FAILED',
        userId: attempt.userId,
        request,
        metadata: { attemptId: attempt.id, reason: 'email_taken' },
      });

      throw new ConflictException('Email already in use');
    }

    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException(INVALID_OR_EXPIRED_CODE_MESSAGE);
    }

    user.email = attempt.newEmail;
    const savedUser = await this.usersService.save(user);

    attempt.status = 'CONFIRMED';
    attempt.confirmedAt = new Date();
    await this.pendingEmailChangeRepository.save(attempt);

    await this.auditLogService.record({
      eventType: 'EMAIL_CHANGE_CONFIRMED',
      userId: attempt.userId,
      email: savedUser.email,
      request,
      metadata: { attemptId: attempt.id },
    });

    return savedUser;
  }

  // Reissue path for an existing PENDING row past its resend cooldown,
  // mirroring LoginOtpService.resend() but folded into initiate() since
  // there is no separate resend endpoint for email changes.
  private async reissue(
    pending: PendingEmailChange,
    newEmail: string,
    ttlMs: number,
    cooldownMs: number,
    request?: FastifyRequest,
  ): Promise<EmailChangePendingDto> {
    const now = new Date();
    const code = this.generateOtpCode();

    pending.newEmail = newEmail;
    pending.codeHash = await this.hashCode(code);
    pending.expiresAt = new Date(now.getTime() + ttlMs);
    pending.lastSentAt = now;

    const saved = await this.pendingEmailChangeRepository.save(pending);

    await this.mailerService.sendEmailChangeOtpEmail({
      to: newEmail,
      code,
      ttlMinutes: this.toMinutes(ttlMs),
      newEmail,
    });

    await this.auditLogService.record({
      eventType: 'EMAIL_CHANGE_OTP_SENT',
      userId: pending.userId,
      request,
      metadata: { attemptId: saved.id },
    });

    return EmailChangePendingDto.from(saved, cooldownMs);
  }

  private async findActiveChallengeOrThrow(
    challengeId: string,
    userId: string,
    request?: FastifyRequest,
  ): Promise<PendingEmailChange> {
    const attempt = await this.pendingEmailChangeRepository.findOne({
      where: { id: challengeId },
    });

    if (!attempt || attempt.userId !== userId || attempt.status !== 'PENDING') {
      throw new UnauthorizedException(INVALID_OR_EXPIRED_CODE_MESSAGE);
    }

    if (attempt.expiresAt < new Date()) {
      attempt.status = 'EXPIRED';
      await this.pendingEmailChangeRepository.save(attempt);

      await this.auditLogService.record({
        eventType: 'EMAIL_CHANGE_EXPIRED',
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
    const length = Number(this.configService.get('EMAIL_CHANGE_OTP_LENGTH'));
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
