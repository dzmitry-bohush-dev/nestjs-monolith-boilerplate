import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';

import { AuditLogService } from '@/core/audit-log/audit-log.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';
import { UserProfileDto } from '@/modules/users/dtos/user-profile.dto';
import { User } from '@/modules/users/entities/user.entity';
import {
  ProfileAccessType,
  UserProfileAccessGuard,
} from '@/modules/users/guards/user-profile-access.guard';
import { UsersService } from '@/modules/users/services/users.service';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get(':userId')
  @UseGuards(UserProfileAccessGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Get a user profile' })
  @ApiResponse({ status: 200, type: UserProfileDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  @ApiNotFoundResponse({ description: 'User not found' })
  async getProfile(
    @Param('userId') userId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req()
    request: FastifyRequest & {
      targetUser: User;
      profileAccessType: ProfileAccessType;
    },
  ): Promise<UserProfileDto> {
    await this.auditLogService.record({
      eventType: 'USER_PROFILE_VIEWED',
      userId: currentUser.userId,
      request,
      metadata: { targetUserId: userId, accessType: request.profileAccessType },
    });

    return UserProfileDto.from(request.targetUser);
  }
}
