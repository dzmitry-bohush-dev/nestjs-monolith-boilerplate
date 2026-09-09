import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';

import { AuditLogService } from '@/core/audit-log/audit-log.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';
import { CheckProfileAccess } from '@/modules/users/decorators/check-profile-access.decorator';
import { ConfirmEmailChangeDto } from '@/modules/users/dtos/confirm-email-change.dto';
import { EmailChangePendingDto } from '@/modules/users/dtos/email-change-pending.dto';
import { InitiateEmailChangeDto } from '@/modules/users/dtos/initiate-email-change.dto';
import { UpdateUserDto } from '@/modules/users/dtos/update-user.dto';
import { UserProfileDto } from '@/modules/users/dtos/user-profile.dto';
import { User } from '@/modules/users/entities/user.entity';
import { SelfOnlyGuard } from '@/modules/users/guards/self-only.guard';
import {
  ProfileAccessType,
  UserProfileAccessGuard,
} from '@/modules/users/guards/user-profile-access.guard';
import { EmailChangeService } from '@/modules/users/services/email-change.service';
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
    private readonly emailChangeService: EmailChangeService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get(':userId')
  @UseGuards(UserProfileAccessGuard)
  @CheckProfileAccess('users', 'read')
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

  @Patch(':userId')
  @UseGuards(UserProfileAccessGuard)
  @CheckProfileAccess('users', 'update')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Update a user profile' })
  @ApiResponse({ status: 200, type: UserProfileDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiConflictResponse({ description: 'Email already in use' })
  async updateProfile(
    @Param('userId') userId: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req()
    request: FastifyRequest & {
      targetUser: User;
      profileAccessType: ProfileAccessType;
    },
  ): Promise<UserProfileDto> {
    const updated = await this.usersService.update(
      request.targetUser,
      dto,
      request.profileAccessType,
    );

    await this.auditLogService.record({
      eventType: 'USER_PROFILE_UPDATED',
      userId: currentUser.userId,
      request,
      metadata: {
        targetUserId: userId,
        accessType: request.profileAccessType,
        fields: Object.entries(dto)
          .filter(([, value]) => value !== undefined)
          .map(([key]) => key),
      },
    });

    return UserProfileDto.from(updated);
  }

  @Post(':userId/email-change')
  @UseGuards(SelfOnlyGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Initiate a self-service email change' })
  @ApiResponse({ status: 202, type: EmailChangePendingDto })
  @ApiForbiddenResponse({ description: 'Can only change your own email' })
  @ApiConflictResponse({ description: 'Email already in use' })
  @ApiTooManyRequestsResponse({ description: 'Resend cooldown not elapsed' })
  async initiateEmailChange(
    @Body() dto: InitiateEmailChangeDto,
    @Req() request: FastifyRequest & { targetUser: User },
  ): Promise<EmailChangePendingDto> {
    return this.emailChangeService.initiate(
      request.targetUser,
      dto.newEmail,
      request,
    );
  }

  @Post(':userId/email-change/confirm')
  @UseGuards(SelfOnlyGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Confirm a pending email change with an OTP code' })
  @ApiResponse({ status: 200, type: UserProfileDto })
  @ApiUnauthorizedResponse({
    description: 'Invalid, expired, or already-used confirmation code',
  })
  async confirmEmailChange(
    @Param('userId') userId: string,
    @Body() dto: ConfirmEmailChangeDto,
    @Req() request: FastifyRequest,
  ): Promise<UserProfileDto> {
    const user = await this.emailChangeService.confirm(
      userId,
      dto.challengeId,
      dto.code,
      request,
    );

    return UserProfileDto.from(user);
  }
}
