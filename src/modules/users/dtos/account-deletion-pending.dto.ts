import { ApiProperty } from '@nestjs/swagger';

import { PendingUserDeletion } from '@/modules/users/entities/pending-user-deletion.entity';

export class AccountDeletionPendingDto {
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
    attempt: PendingUserDeletion,
    resendCooldownMs: number,
  ): AccountDeletionPendingDto {
    const dto = new AccountDeletionPendingDto();

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
