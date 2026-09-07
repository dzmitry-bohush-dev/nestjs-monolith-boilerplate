import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class UpdateActionConfirmationSettingDto {
  @ApiProperty({
    example: true,
    description: 'Whether the confirmation step is required for this action',
  })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({
    example: 'otp',
    description: 'Confirmation method to use',
    enum: ['otp'],
    required: false,
  })
  @IsOptional()
  @IsIn(['otp'])
  confirmationMethod?: 'otp';
}
