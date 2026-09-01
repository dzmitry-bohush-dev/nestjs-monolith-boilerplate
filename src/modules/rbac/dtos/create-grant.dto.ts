import { IsUUID, IsArray, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateGrantDto {
  @ApiProperty({
    example: 'role-1',
    description: 'Role ID',
    format: 'uuid',
  })
  @IsUUID()
  roleId!: string;

  @ApiProperty({
    example: 'perm-1',
    description: 'Permission ID',
    format: 'uuid',
  })
  @IsUUID()
  permissionId!: string;

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
