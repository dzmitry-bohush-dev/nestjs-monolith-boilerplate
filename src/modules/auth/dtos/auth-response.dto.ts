import { ApiProperty } from '@nestjs/swagger';

class AuthResponseUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;
}

export class AuthResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ type: AuthResponseUserDto })
  user!: AuthResponseUserDto;

  static from(params: {
    accessToken: string;
    user: { id: string; email: string };
  }): AuthResponseDto {
    const dto = new AuthResponseDto();

    dto.accessToken = params.accessToken;
    dto.user = { id: params.user.id, email: params.user.email };

    return dto;
  }
}
