import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FastifyRequest } from 'fastify';

import { AuditLogService } from '@/core/audit-log/audit-log.service';
import { AuditLog } from '@/core/audit-log/entities/audit-log.entity';

type MockRepository = {
  create: jest.Mock;
  save: jest.Mock;
};

describe('AuditLogService', () => {
  let service: AuditLogService;
  let repository: MockRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
    repository = module.get(getRepositoryToken(AuditLog));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('record', () => {
    it('records an event with minimal fields and no request context', async () => {
      const created = { eventType: 'USER_REGISTERED' } as AuditLog;
      const saved = { ...created, id: '1' } as AuditLog;
      repository.create.mockReturnValue(created);
      repository.save.mockResolvedValue(saved);

      const result = await service.record({ eventType: 'USER_REGISTERED' });

      expect(repository.create).toHaveBeenCalledWith({
        eventType: 'USER_REGISTERED',
        userId: null,
        email: null,
        ipAddress: null,
        userAgent: null,
        metadata: null,
      });
      expect(repository.save).toHaveBeenCalledWith(created);
      expect(result).toBe(saved);
    });

    it('extracts ip and user-agent from the request', async () => {
      const created = {} as AuditLog;
      repository.create.mockReturnValue(created);
      repository.save.mockResolvedValue(created);

      const request = {
        ip: '127.0.0.1',
        headers: { 'user-agent': 'jest-agent' },
      } as unknown as FastifyRequest;

      await service.record({
        eventType: 'USER_LOGGED_IN',
        userId: 'user-1',
        email: 'test@example.com',
        request,
        metadata: { foo: 'bar' },
      });

      expect(repository.create).toHaveBeenCalledWith({
        eventType: 'USER_LOGGED_IN',
        userId: 'user-1',
        email: 'test@example.com',
        ipAddress: '127.0.0.1',
        userAgent: 'jest-agent',
        metadata: { foo: 'bar' },
      });
    });

    it('takes the first value when the user-agent header is an array', async () => {
      const created = {} as AuditLog;
      repository.create.mockReturnValue(created);
      repository.save.mockResolvedValue(created);

      const request = {
        ip: '127.0.0.1',
        headers: { 'user-agent': ['first-agent', 'second-agent'] },
      } as unknown as FastifyRequest;

      await service.record({ eventType: 'USER_LOGGED_IN', request });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ userAgent: 'first-agent' }),
      );
    });
  });
});
