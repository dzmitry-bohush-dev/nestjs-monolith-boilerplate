import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import type { FastifyRequest } from 'fastify';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';

import { AuditLogService } from '@/core/audit-log/audit-log.service';
import { ConfigService } from '@/core/config/config.service';
import { MailerService } from '@/core/mailer/mailer.service';
import { LoginConfirmationPendingDto } from '@/modules/auth/dtos/login-confirmation-pending.dto';
import { PendingLoginAttempt } from '@/modules/auth/entities/pending-login-attempt.entity';
import { User } from '@/modules/users/entities/user.entity';
import { UsersService } from '@/modules/users/services/users.service';

const INVALID_OR_EXPIRED_CODE_MESSAGE = 'Invalid or expired confirmation code';

@Injectable()
export class LoginOtpService {
  constructor(
    @InjectRepository(PendingLoginAttempt)
    private readonly pendingLoginAttemptRepository: Repository<PendingLoginAttempt>,
    private readonly usersService: UsersService,
    private readonly mailerService: MailerService,
    private readonly auditLogService: AuditLogService,
    private readonly configService: ConfigService,
  ) {}

  @Transactional()
  async initiate(
    user: User,
    request?: FastifyRequest,
  ): Promise<LoginConfirmationPendingDto> {
    const ttlMs = Number(this.configService.get('LOGIN_OTP_TTL_MS'));
    const maxAttempts = Number(
      this.configService.get('LOGIN_OTP_MAX_ATTEMPTS'),
    );
    const now = new Date();

    const code = this.generateOtpCode();
    const attempt = this.pendingLoginAttemptRepository.create({
      userId: user.id,
      email: user.email,
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

    const saved = await this.pendingLoginAttemptRepository.save(attempt);

    await this.mailerService.sendLoginOtpEmail({
      to: user.email,
      code,
      ttlMinutes: this.toMinutes(ttlMs),
    });

    await this.auditLogService.record({
      eventType: 'LOGIN_OTP_SENT',
      userId: user.id,
      email: user.email,
      request,
      metadata: { attemptId: saved.id },
    });

    return LoginConfirmationPendingDto.from(
      saved,
      Number(this.configService.get('LOGIN_OTP_RESEND_COOLDOWN_MS')),
    );
  }

  // Not @Transactional(): a rejected/failed outcome still needs its
  // save()/audit record to persist even though this method then throws,
  // and @Transactional() would roll back everything written before the throw.
  async resend(
    attemptId: string,
    request?: FastifyRequest,
  ): Promise<LoginConfirmationPendingDto> {
    const attempt = await this.findActiveAttemptOrThrow(attemptId);

    const cooldownMs = Number(
      this.configService.get('LOGIN_OTP_RESEND_COOLDOWN_MS'),
    );
    const now = new Date();
    const resendAvailableAt = new Date(
      attempt.lastSentAt.getTime() + cooldownMs,
    );

    if (now < resendAvailableAt) {
      await this.auditLogService.record({
        eventType: 'LOGIN_OTP_RESEND_REJECTED',
        userId: attempt.userId,
        email: attempt.email,
        request,
        metadata: { attemptId: attempt.id },
      });

      throw new HttpException(
        'Resend not available yet',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const ttlMs = Number(this.configService.get('LOGIN_OTP_TTL_MS'));
    const code = this.generateOtpCode();

    attempt.codeHash = await this.hashCode(code);
    attempt.expiresAt = new Date(now.getTime() + ttlMs);
    attempt.lastSentAt = now;

    const saved = await this.pendingLoginAttemptRepository.save(attempt);

    await this.mailerService.sendLoginOtpEmail({
      to: attempt.email,
      code,
      ttlMinutes: this.toMinutes(ttlMs),
    });

    await this.auditLogService.record({
      eventType: 'LOGIN_OTP_RESENT',
      userId: attempt.userId,
      email: attempt.email,
      request,
      metadata: { attemptId: attempt.id },
    });

    return LoginConfirmationPendingDto.from(saved, cooldownMs);
  }

  // See the comment on resend(): not @Transactional() for the same reason.
  async confirm(
    attemptId: string,
    otpCode: string,
    request?: FastifyRequest,
  ): Promise<User> {
    const attempt = await this.findActiveAttemptOrThrow(attemptId);

    const isValid = await bcrypt.compare(otpCode, attempt.codeHash);

    if (!isValid) {
      attempt.attemptCount += 1;

      if (attempt.attemptCount >= attempt.maxAttempts) {
        attempt.status = 'FAILED';
        await this.pendingLoginAttemptRepository.save(attempt);

        await this.auditLogService.record({
          eventType: 'LOGIN_ATTEMPT_LOCKED',
          userId: attempt.userId,
          email: attempt.email,
          request,
          metadata: { attemptId: attempt.id },
        });
      } else {
        await this.pendingLoginAttemptRepository.save(attempt);

        await this.auditLogService.record({
          eventType: 'LOGIN_OTP_VERIFICATION_FAILED',
          userId: attempt.userId,
          email: attempt.email,
          request,
          metadata: { attemptId: attempt.id },
        });
      }

      throw new UnauthorizedException(INVALID_OR_EXPIRED_CODE_MESSAGE);
    }

    attempt.status = 'CONFIRMED';
    attempt.confirmedAt = new Date();
    await this.pendingLoginAttemptRepository.save(attempt);

    const user = await this.usersService.findById(attempt.userId);

    if (!user) {
      throw new UnauthorizedException(INVALID_OR_EXPIRED_CODE_MESSAGE);
    }

    return user;
  }

  private async findActiveAttemptOrThrow(
    attemptId: string,
  ): Promise<PendingLoginAttempt> {
    const attempt = await this.pendingLoginAttemptRepository.findOne({
      where: { id: attemptId },
    });

    if (!attempt || attempt.status !== 'PENDING') {
      throw new UnauthorizedException(INVALID_OR_EXPIRED_CODE_MESSAGE);
    }

    if (attempt.expiresAt < new Date()) {
      attempt.status = 'EXPIRED';
      await this.pendingLoginAttemptRepository.save(attempt);
      throw new UnauthorizedException(INVALID_OR_EXPIRED_CODE_MESSAGE);
    }

    return attempt;
  }

  private generateOtpCode(): string {
    const length = Number(this.configService.get('LOGIN_OTP_LENGTH'));
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
