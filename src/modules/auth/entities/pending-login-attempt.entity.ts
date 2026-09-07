import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/shared/entities/base.entity';
import { User } from '@/modules/users/entities/user.entity';

export type PendingLoginAttemptStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'EXPIRED'
  | 'FAILED';

@Entity('pending_login_attempts')
export class PendingLoginAttempt extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Index()
  @Column()
  userId!: string;

  @ApiProperty({ type: () => User, required: false })
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @ApiProperty()
  @Column()
  email!: string;

  @ApiProperty()
  @Column({ name: 'confirmation_method', default: 'otp' })
  confirmationMethod!: string;

  @ApiProperty()
  @Column({ name: 'code_hash' })
  codeHash!: string;

  @ApiProperty()
  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt!: Date;

  @ApiProperty()
  @Column({ name: 'attempt_count', default: 0 })
  attemptCount!: number;

  @ApiProperty()
  @Column({ name: 'max_attempts' })
  maxAttempts!: number;

  @ApiProperty({ enum: ['PENDING', 'CONFIRMED', 'EXPIRED', 'FAILED'] })
  @Column({ default: 'PENDING' })
  status!: PendingLoginAttemptStatus;

  @ApiProperty()
  @Column({ type: 'timestamptz', name: 'last_sent_at' })
  lastSentAt!: Date;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'timestamptz', name: 'confirmed_at', nullable: true })
  confirmedAt?: Date | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ name: 'ip_address', nullable: true })
  ipAddress?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ name: 'user_agent', nullable: true })
  userAgent?: string | null;
}
