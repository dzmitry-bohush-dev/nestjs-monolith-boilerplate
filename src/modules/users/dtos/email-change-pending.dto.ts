import { ApiProperty } from '@nestjs/swagger';

import { PendingEmailChange } from '@/modules/users/entities/pending-email-change.entity';

export class EmailChangePendingDto {
  @ApiProperty({ format: 'uuid' })
  challengeId!: string;

  @ApiProperty({ enum: [true] })
  requiresConfirmation!: true;

  @ApiProperty({ enum: ['otp'] })
  confirmationMethod!: string;

  @ApiProperty()
  expiresAt!: Date;

  @ApiProperty()
  resendAvailableAt!: Date;

  static from(
    attempt: PendingEmailChange,
    resendCooldownMs: number,
  ): EmailChangePendingDto {
    const dto = new EmailChangePendingDto();

    dto.challengeId = attempt.id;
    dto.requiresConfirmation = true;
    dto.confirmationMethod = attempt.confirmationMethod;
    dto.expiresAt = attempt.expiresAt;
    dto.resendAvailableAt = new Date(
      attempt.lastSentAt.getTime() + resendCooldownMs,
    );

    return dto;
  }
}
