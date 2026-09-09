import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class InitiateAccountDeletionDto {
  @ApiPropertyOptional({ example: 'No longer need this account' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
