import { Test, TestingModule } from '@nestjs/testing';
import { FastifyRequest } from 'fastify';

import { AuthController } from '@/modules/auth/controllers/auth.controller';
import { AuthResponseDto } from '@/modules/auth/dtos/auth-response.dto';
import { LoginDto } from '@/modules/auth/dtos/login.dto';
import { RegisterDto } from '@/modules/auth/dtos/register.dto';
import { AuthService } from '@/modules/auth/services/auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { register: jest.Mock; login: jest.Mock };

  const request = {} as FastifyRequest;
  const response: AuthResponseDto = {
    accessToken: 'access-token',
    user: { id: 'user-1', email: 'test@example.com' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: { register: jest.fn(), login: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
  });

  describe('register', () => {
    it('delegates to AuthService.register', async () => {
      const dto: RegisterDto = {
        email: 'test@example.com',
        password: 'p@ssw0rd123',
      };
      authService.register.mockResolvedValue(response);

      const result = await controller.register(dto, request);

      expect(authService.register).toHaveBeenCalledWith(dto, request);
      expect(result).toBe(response);
    });
  });

  describe('login', () => {
    it('delegates to AuthService.login', async () => {
      const dto: LoginDto = {
        email: 'test@example.com',
        password: 'p@ssw0rd123',
      };
      authService.login.mockResolvedValue(response);

      const result = await controller.login(dto, request);

      expect(authService.login).toHaveBeenCalledWith(dto, request);
      expect(result).toBe(response);
    });
  });
});
