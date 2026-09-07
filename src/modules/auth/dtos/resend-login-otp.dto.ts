import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ResendLoginOtpDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  attemptId!: string;
}
