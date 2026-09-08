import { Test, TestingModule } from '@nestjs/testing';
import type { FastifyRequest } from 'fastify';

import { AuditLogService } from '@/core/audit-log/audit-log.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';
import { UsersController } from '@/modules/users/controllers/users.controller';
import { User } from '@/modules/users/entities/user.entity';
import { UserProfileAccessGuard } from '@/modules/users/guards/user-profile-access.guard';
import { UsersService } from '@/modules/users/services/users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let auditLogService: { record: jest.Mock };

  const currentUser: AuthenticatedUser = {
    userId: 'user-1',
    email: 'user@example.com',
  };
  const targetUser = {
    id: 'user-2',
    email: 'target@example.com',
    photo: null,
  } as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: { findById: jest.fn() } },
        { provide: AuditLogService, useValue: { record: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(UserProfileAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsersController>(UsersController);
    auditLogService = module.get(AuditLogService);
  });

  describe('getProfile', () => {
    it('records an audit event and returns the profile built from request.targetUser', async () => {
      const request = {
        targetUser,
        profileAccessType: 'self',
      } as unknown as FastifyRequest & {
        targetUser: User;
        profileAccessType: 'self' | 'permission';
      };

      const result = await controller.getProfile(
        'user-2',
        currentUser,
        request,
      );

      expect(auditLogService.record).toHaveBeenCalledWith({
        eventType: 'USER_PROFILE_VIEWED',
        userId: 'user-1',
        request,
        metadata: { targetUserId: 'user-2', accessType: 'self' },
      });
      expect(result).toEqual({
        id: 'user-2',
        email: 'target@example.com',
        photo: null,
      });
    });

    it('reports the permission-based access type in the audit event', async () => {
      const request = {
        targetUser,
        profileAccessType: 'permission',
      } as unknown as FastifyRequest & {
        targetUser: User;
        profileAccessType: 'self' | 'permission';
      };

      await controller.getProfile('user-2', currentUser, request);

      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { targetUserId: 'user-2', accessType: 'permission' },
        }),
      );
    });
  });
});
