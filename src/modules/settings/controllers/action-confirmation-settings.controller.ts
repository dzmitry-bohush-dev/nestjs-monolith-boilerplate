import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';
import { CheckPermission } from '@/modules/rbac/decorators/check-permission.decorator';
import { PermissionGuard } from '@/modules/rbac/guards/permission.guard';
import { UpdateActionConfirmationSettingDto } from '@/modules/settings/dtos/update-action-confirmation-setting.dto';
import { ActionConfirmationSetting } from '@/modules/settings/entities/action-confirmation-setting.entity';
import { ActionConfirmationSettingsService } from '@/modules/settings/services/action-confirmation-settings.service';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';

@ApiTags('admin/settings/action-confirmations')
@ApiBearerAuth()
@Controller('admin/settings/action-confirmations')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
export class ActionConfirmationSettingsController {
  constructor(
    private readonly actionConfirmationSettingsService: ActionConfirmationSettingsService,
  ) {}

  @Get()
  @CheckPermission('settings', 'read')
  @ApiOperation({ summary: 'List all action confirmation settings' })
  @ApiResponse({ status: 200, type: [ActionConfirmationSetting] })
  findAll(): Promise<ActionConfirmationSetting[]> {
    return this.actionConfirmationSettingsService.findAll();
  }

  @Get(':action')
  @CheckPermission('settings', 'read')
  @ApiOperation({ summary: 'Get the confirmation setting for an action' })
  @ApiResponse({ status: 200, type: ActionConfirmationSetting })
  @ApiNotFoundResponse({ description: 'Setting not configured for action' })
  async findByAction(
    @Param('action') action: string,
  ): Promise<ActionConfirmationSetting> {
    const setting =
      await this.actionConfirmationSettingsService.findByAction(action);

    if (!setting) {
      throw new NotFoundException(
        `No confirmation setting configured for action "${action}"`,
      );
    }

    return setting;
  }

  @Put(':action')
  @CheckPermission('settings', 'update')
  @ApiOperation({ summary: 'Enable/disable confirmation for an action' })
  @ApiResponse({ status: 200, type: ActionConfirmationSetting })
  update(
    @Param('action') action: string,
    @Body() dto: UpdateActionConfirmationSettingDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<ActionConfirmationSetting> {
    return this.actionConfirmationSettingsService.upsert(
      action,
      dto,
      user,
      request,
    );
  }
}
