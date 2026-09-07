import { ApiProperty } from '@nestjs/swagger';

import { PendingLoginAttempt } from '@/modules/auth/entities/pending-login-attempt.entity';

export class LoginConfirmationPendingDto {
  @ApiProperty({ format: 'uuid' })
  attemptId!: string;

  @ApiProperty({ enum: ['otp'] })
  confirmationMethod!: string;

  @ApiProperty()
  expiresAt!: Date;

  @ApiProperty()
  resendAvailableAt!: Date;

  static from(
    attempt: PendingLoginAttempt,
    resendCooldownMs: number,
  ): LoginConfirmationPendingDto {
    const dto = new LoginConfirmationPendingDto();

    dto.attemptId = attempt.id;
    dto.confirmationMethod = attempt.confirmationMethod;
    dto.expiresAt = attempt.expiresAt;
    dto.resendAvailableAt = new Date(
      attempt.lastSentAt.getTime() + resendCooldownMs,
    );

    return dto;
  }
}
