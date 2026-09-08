import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { FastifyRequest } from 'fastify';

import { AuditLogService } from '@/core/audit-log/audit-log.service';
import { ConfigService } from '@/core/config/config.service';
import { JwtStrategy } from '@/modules/auth/strategies/jwt.strategy';
import { DecodedAccessTokenPayload } from '@/modules/auth/types/jwt-payload.type';
import { User } from '@/modules/users/entities/user.entity';
import { UsersService } from '@/modules/users/services/users.service';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let usersService: { findById: jest.Mock };
  let auditLogService: { record: jest.Mock };

  const request = {} as FastifyRequest;
  const user = { id: 'user-1', email: 'test@example.com' } as User;

  const payload = (overrides: Partial<DecodedAccessTokenPayload> = {}) =>
    ({
      sub: user.id,
      email: user.email,
      type: 'access',
      iat: 0,
      exp: 0,
      ...overrides,
    }) as DecodedAccessTokenPayload;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('access-secret') },
        },
        {
          provide: UsersService,
          useValue: { findById: jest.fn() },
        },
        {
          provide: AuditLogService,
          useValue: { record: jest.fn() },
        },
      ],
    }).compile();

    strategy = module.get(JwtStrategy);
    usersService = module.get(UsersService);
    auditLogService = module.get(AuditLogService);
  });

  it('rejects and audits ACCESS_TOKEN_REJECTED (wrong_token_type) when the payload is not an access token', async () => {
    await expect(
      strategy.validate(request, payload({ type: 'refresh' as 'access' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(usersService.findById).not.toHaveBeenCalled();
    expect(auditLogService.record).toHaveBeenCalledWith({
      eventType: 'ACCESS_TOKEN_REJECTED',
      request,
      metadata: { reason: 'wrong_token_type' },
    });
  });

  it('rejects and audits ACCESS_TOKEN_REJECTED (user_not_found) when the user no longer exists', async () => {
    usersService.findById.mockResolvedValue(null);

    await expect(strategy.validate(request, payload())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(usersService.findById).toHaveBeenCalledWith(user.id);
    expect(auditLogService.record).toHaveBeenCalledWith({
      eventType: 'ACCESS_TOKEN_REJECTED',
      request,
      metadata: { reason: 'user_not_found' },
    });
  });

  it('resolves the authenticated user when the token type and user both check out', async () => {
    usersService.findById.mockResolvedValue(user);

    const result = await strategy.validate(request, payload());

    expect(result).toEqual({ userId: user.id, email: user.email });
    expect(auditLogService.record).not.toHaveBeenCalled();
  });
});
