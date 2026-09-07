import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Length } from 'class-validator';

export class ConfirmLoginDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  attemptId!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(4, 10)
  otpCode!: string;
}
