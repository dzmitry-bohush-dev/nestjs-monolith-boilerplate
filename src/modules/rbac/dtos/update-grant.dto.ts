import { IsArray, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateGrantDto {
  @ApiProperty({
    example: ['create', 'read'],
    description: 'Subset of permission actions (null/empty = all)',
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  actions?: string[];
}
