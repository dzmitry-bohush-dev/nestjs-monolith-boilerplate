import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class InitiateEmailChangeDto {
  @ApiProperty({ example: 'new-user@example.com' })
  @IsEmail()
  newEmail!: string;
}
