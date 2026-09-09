import { Test, TestingModule } from '@nestjs/testing';
import type { FastifyRequest } from 'fastify';

import { AuditLogService } from '@/core/audit-log/audit-log.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';
import { UsersController } from '@/modules/users/controllers/users.controller';
import { UpdateUserDto } from '@/modules/users/dtos/update-user.dto';
import { User } from '@/modules/users/entities/user.entity';
import { SelfOnlyGuard } from '@/modules/users/guards/self-only.guard';
import { UserProfileAccessGuard } from '@/modules/users/guards/user-profile-access.guard';
import { EmailChangeService } from '@/modules/users/services/email-change.service';
import { UsersService } from '@/modules/users/services/users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let auditLogService: { record: jest.Mock };
  let usersService: { findById: jest.Mock; update: jest.Mock };
  let emailChangeService: { initiate: jest.Mock; confirm: jest.Mock };

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
        {
          provide: UsersService,
          useValue: { findById: jest.fn(), update: jest.fn() },
        },
        {
          provide: EmailChangeService,
          useValue: { initiate: jest.fn(), confirm: jest.fn() },
        },
        { provide: AuditLogService, useValue: { record: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(UserProfileAccessGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SelfOnlyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsersController>(UsersController);
    auditLogService = module.get(AuditLogService);
    usersService = module.get(UsersService);
    emailChangeService = module.get(EmailChangeService);
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

  describe('updateProfile', () => {
    it('updates the profile, records an audit event with field names only, and returns the updated profile', async () => {
      const updatedUser = { ...targetUser, firstName: 'Jane' } as User;
      usersService.update.mockResolvedValue(updatedUser);
      const dto = { firstName: 'Jane' };
      const request = {
        targetUser,
        profileAccessType: 'self',
      } as unknown as FastifyRequest & {
        targetUser: User;
        profileAccessType: 'self' | 'permission';
      };

      const result = await controller.updateProfile(
        'user-2',
        dto,
        currentUser,
        request,
      );

      expect(usersService.update).toHaveBeenCalledWith(targetUser, dto, 'self');
      expect(auditLogService.record).toHaveBeenCalledWith({
        eventType: 'USER_PROFILE_UPDATED',
        userId: 'user-1',
        request,
        metadata: {
          targetUserId: 'user-2',
          accessType: 'self',
          fields: ['firstName'],
        },
      });
      expect(result).toEqual({
        id: 'user-2',
        email: 'target@example.com',
        photo: null,
        firstName: 'Jane',
      });
    });

    it('never includes field values in the audit metadata', async () => {
      usersService.update.mockResolvedValue(targetUser);
      const dto = { email: 'new@example.com', photo: 'secret-photo-url' };
      const request = {
        targetUser,
        profileAccessType: 'permission',
      } as unknown as FastifyRequest & {
        targetUser: User;
        profileAccessType: 'self' | 'permission';
      };

      await controller.updateProfile('user-2', dto, currentUser, request);

      const calls = auditLogService.record.mock.calls as unknown as [
        { metadata: { fields: string[] } },
      ][];
      const auditCall = calls[0][0];
      const serializedMetadata = JSON.stringify(auditCall.metadata);

      expect(auditCall.metadata.fields.sort()).toEqual(['email', 'photo']);
      expect(serializedMetadata).not.toContain('new@example.com');
      expect(serializedMetadata).not.toContain('secret-photo-url');
    });

    it('lists only the fields actually sent, even for a class-transformed DTO with unset fields present as undefined', async () => {
      // ValidationPipe({ transform: true }) produces a DTO instance where
      // every declared field is an own property (undefined if omitted from
      // the request body), so Object.keys(dto) alone would over-report.
      usersService.update.mockResolvedValue(targetUser);
      const dto = Object.assign(new UpdateUserDto(), {
        firstName: 'Jane',
      }) as UpdateUserDto;
      const request = {
        targetUser,
        profileAccessType: 'self',
      } as unknown as FastifyRequest & {
        targetUser: User;
        profileAccessType: 'self' | 'permission';
      };

      await controller.updateProfile('user-2', dto, currentUser, request);

      const calls = auditLogService.record.mock.calls as unknown as [
        { metadata: { fields: string[] } },
      ][];
      const auditCall = calls[0][0];

      expect(auditCall.metadata.fields).toEqual(['firstName']);
    });
  });

  describe('initiateEmailChange', () => {
    it('delegates to EmailChangeService.initiate with the target user', async () => {
      const pending = { challengeId: 'challenge-1' };
      emailChangeService.initiate.mockResolvedValue(pending);
      const dto = { newEmail: 'new@example.com' };
      const request = {
        targetUser,
      } as unknown as FastifyRequest & { targetUser: User };

      const result = await controller.initiateEmailChange(dto, request);

      expect(emailChangeService.initiate).toHaveBeenCalledWith(
        targetUser,
        'new@example.com',
        request,
      );
      expect(result).toBe(pending);
    });
  });

  describe('confirmEmailChange', () => {
    it('delegates to EmailChangeService.confirm and returns the updated profile', async () => {
      const confirmedUser = {
        id: 'user-1',
        email: 'new@example.com',
        photo: null,
      } as User;
      emailChangeService.confirm.mockResolvedValue(confirmedUser);
      const dto = { challengeId: 'challenge-1', code: '123456' };
      const request = {} as FastifyRequest;

      const result = await controller.confirmEmailChange(
        'user-1',
        dto,
        request,
      );

      expect(emailChangeService.confirm).toHaveBeenCalledWith(
        'user-1',
        'challenge-1',
        '123456',
        request,
      );
      expect(result).toEqual({
        id: 'user-1',
        email: 'new@example.com',
        photo: null,
      });
    });
  });
});
