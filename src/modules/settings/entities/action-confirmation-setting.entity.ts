import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@/shared/entities/base.entity';

@Entity('action_confirmation_settings')
export class ActionConfirmationSetting extends BaseEntity {
  @ApiProperty()
  @Column({ unique: true })
  action!: string;

  @ApiProperty()
  @Column({ default: false })
  enabled!: boolean;

  @ApiProperty()
  @Column({ name: 'confirmation_method', default: 'otp' })
  confirmationMethod!: string;

  @ApiProperty({ format: 'uuid', required: false, nullable: true })
  @Column({ type: 'uuid', name: 'updated_by_user_id', nullable: true })
  updatedByUserId?: string | null;
}
