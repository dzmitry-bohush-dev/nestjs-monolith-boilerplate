import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignRoleDto {
  @ApiProperty({
    example: 'role-1',
    description: 'Role ID',
    format: 'uuid',
  })
  @IsUUID()
  roleId!: string;
}
