import { ApiProperty } from '@nestjs/swagger';

import { User } from '@/modules/users/entities/user.entity';

export class UserProfileDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ type: String, nullable: true })
  photo!: string | null;

  static from(user: User): UserProfileDto {
    const dto = new UserProfileDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.photo = user.photo;
    return dto;
  }
}
