import { IsString, Length, IsArray, ArrayNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePermissionDto {
  @ApiProperty({ example: 'posts', description: 'Permission name' })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({
    example: ['create', 'read', 'update', 'delete'],
    description: 'List of allowed actions',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  actions!: string[];
}
