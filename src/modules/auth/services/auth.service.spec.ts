jest.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));
jest.mock('bcrypt');

import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';

import { AuditLogService } from '@/core/audit-log/audit-log.service';
import { ConfigService } from '@/core/config/config.service';
import { RegisterDto } from '@/modules/auth/dtos/register.dto';
import { LoginDto } from '@/modules/auth/dtos/login.dto';
import { AuthService } from '@/modules/auth/services/auth.service';
import { User } from '@/modules/users/entities/user.entity';
import { UsersService } from '@/modules/users/services/users.service';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: { findByEmail: jest.Mock; create: jest.Mock };
  let auditLogService: { record: jest.Mock };
  let jwtService: { sign: jest.Mock };
  let configService: { get: jest.Mock };

  const user = {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
  } as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: { findByEmail: jest.fn(), create: jest.fn() },
        },
        {
          provide: AuditLogService,
          useValue: { record: jest.fn() },
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    auditLogService = module.get(AuditLogService);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    const dto: RegisterDto = {
      email: 'test@example.com',
      password: 'p@ssw0rd123',
    };

    it('registers a new user, records the audit event and returns a token', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      configService.get.mockReturnValue('16');
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      usersService.create.mockResolvedValue(user);
      jwtService.sign.mockReturnValue('access-token');

      const result = await service.register(dto);

      expect(usersService.findByEmail).toHaveBeenCalledWith(dto.email);
      expect(bcrypt.hash).toHaveBeenCalledWith(dto.password, 16);
      expect(usersService.create).toHaveBeenCalledWith(
        dto.email,
        'hashed-password',
      );
      expect(auditLogService.record).toHaveBeenCalledWith({
        eventType: 'USER_REGISTERED',
        userId: user.id,
        email: user.email,
        request: undefined,
      });
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: user.id,
        email: user.email,
      });
      expect(result).toEqual({
        accessToken: 'access-token',
        user: { id: user.id, email: user.email },
      });
    });

    it('throws a conflict exception when the email is already registered', async () => {
      usersService.findByEmail.mockResolvedValue(user);

      await expect(service.register(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(usersService.create).not.toHaveBeenCalled();
      expect(auditLogService.record).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const dto: LoginDto = {
      email: 'test@example.com',
      password: 'p@ssw0rd123',
    };

    it('logs the user in, records the audit event and returns a token', async () => {
      usersService.findByEmail.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.sign.mockReturnValue('access-token');

      const result = await service.login(dto);

      expect(bcrypt.compare).toHaveBeenCalledWith(
        dto.password,
        user.passwordHash,
      );
      expect(auditLogService.record).toHaveBeenCalledWith({
        eventType: 'USER_LOGGED_IN',
        userId: user.id,
        email: user.email,
        request: undefined,
      });
      expect(result).toEqual({
        accessToken: 'access-token',
        user: { id: user.id, email: user.email },
      });
    });

    it('throws unauthorized when the email is unknown', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(auditLogService.record).not.toHaveBeenCalled();
    });

    it('throws unauthorized when the password is wrong', async () => {
      usersService.findByEmail.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(dto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(auditLogService.record).not.toHaveBeenCalled();
    });
  });
});
