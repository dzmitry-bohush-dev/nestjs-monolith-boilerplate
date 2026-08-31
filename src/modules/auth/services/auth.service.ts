import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { FastifyRequest } from 'fastify';
import { Transactional } from 'typeorm-transactional';

import { AuditLogService } from '@/core/audit-log/audit-log.service';
import { ConfigService } from '@/core/config/config.service';
import { AuthResponseDto } from '@/modules/auth/dtos/auth-response.dto';
import { LoginDto } from '@/modules/auth/dtos/login.dto';
import { RegisterDto } from '@/modules/auth/dtos/register.dto';
import { JwtPayload } from '@/modules/auth/types/jwt-payload.type';
import { UsersService } from '@/modules/users/services/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly auditLogService: AuditLogService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  @Transactional()
  async register(
    dto: RegisterDto,
    request?: FastifyRequest,
  ): Promise<AuthResponseDto> {
    const existing = await this.usersService.findByEmail(dto.email);

    if (existing) {
      throw new ConflictException('Invalid email or password');
    }

    const saltRounds = Number(this.configService.get('BCRYPT_SALT_ROUNDS'));
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const user = await this.usersService.create(dto.email, passwordHash);

    await this.auditLogService.record({
      eventType: 'USER_REGISTERED',
      userId: user.id,
      email: user.email,
      request,
    });

    return AuthResponseDto.from({
      accessToken: this.signToken({ sub: user.id, email: user.email }),
      user,
    });
  }

  async login(
    dto: LoginDto,
    request?: FastifyRequest,
  ): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.auditLogService.record({
      eventType: 'USER_LOGGED_IN',
      userId: user.id,
      email: user.email,
      request,
    });

    return AuthResponseDto.from({
      accessToken: this.signToken({ sub: user.id, email: user.email }),
      user,
    });
  }

  private signToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload);
  }
}
