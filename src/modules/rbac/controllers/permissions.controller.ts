import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
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
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { CheckPermission } from '@/modules/rbac/decorators/check-permission.decorator';
import { CreatePermissionDto } from '@/modules/rbac/dtos/create-permission.dto';
import { UpdatePermissionDto } from '@/modules/rbac/dtos/update-permission.dto';
import { Permission } from '@/modules/rbac/entities/permission.entity';
import { PermissionGuard } from '@/modules/rbac/guards/permission.guard';
import { PermissionsService } from '@/modules/rbac/services/permissions.service';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';

@ApiTags('rbac/permissions')
@ApiBearerAuth()
@Controller('admin/rbac/permissions')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @CheckPermission('rbac', 'read')
  @ApiOperation({ summary: 'List all permissions' })
  @ApiResponse({ status: HttpStatus.OK, type: [Permission] })
  findAll(): Promise<Permission[]> {
    return this.permissionsService.findAll();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CheckPermission('rbac', 'create')
  @ApiOperation({ summary: 'Create a permission' })
  @ApiResponse({ status: HttpStatus.CREATED, type: Permission })
  @ApiConflictResponse({ description: 'Permission name already exists' })
  create(
    @Body() dto: CreatePermissionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<Permission> {
    return this.permissionsService.create(dto, user, request);
  }

  @Put(':permissionId')
  @CheckPermission('rbac', 'update')
  @ApiOperation({ summary: 'Update a permission' })
  @ApiResponse({ status: HttpStatus.OK, type: Permission })
  @ApiNotFoundResponse({ description: 'Permission not found' })
  @ApiConflictResponse({ description: 'Permission name already exists' })
  update(
    @Param('permissionId') permissionId: string,
    @Body() dto: UpdatePermissionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<Permission> {
    return this.permissionsService.update(permissionId, dto, user, request);
  }

  @Delete(':permissionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CheckPermission('rbac', 'delete')
  @ApiOperation({ summary: 'Delete a permission' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiNotFoundResponse({ description: 'Permission not found' })
  delete(
    @Param('permissionId') permissionId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.permissionsService.delete(permissionId, user, request);
  }
}
