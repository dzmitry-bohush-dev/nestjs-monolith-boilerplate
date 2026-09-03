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
import { CreateRoleDto } from '@/modules/rbac/dtos/create-role.dto';
import { UpdateRoleDto } from '@/modules/rbac/dtos/update-role.dto';
import { Role } from '@/modules/rbac/entities/role.entity';
import { PermissionGuard } from '@/modules/rbac/guards/permission.guard';
import { RolesService } from '@/modules/rbac/services/roles.service';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';

@ApiTags('rbac/roles')
@ApiBearerAuth()
@Controller('admin/rbac/roles')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @CheckPermission('rbac', 'read')
  @ApiOperation({ summary: 'List all roles' })
  @ApiResponse({ status: HttpStatus.OK, type: [Role] })
  findAll(): Promise<Role[]> {
    return this.rolesService.findAll();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CheckPermission('rbac', 'create')
  @ApiOperation({ summary: 'Create a role' })
  @ApiResponse({ status: HttpStatus.CREATED, type: Role })
  @ApiConflictResponse({ description: 'Role name already exists' })
  create(
    @Body() dto: CreateRoleDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<Role> {
    return this.rolesService.create(dto, user, request);
  }

  @Put(':roleId')
  @CheckPermission('rbac', 'update')
  @ApiOperation({ summary: 'Update a role' })
  @ApiResponse({ status: HttpStatus.OK, type: Role })
  @ApiNotFoundResponse({ description: 'Role not found' })
  @ApiConflictResponse({ description: 'Role name already exists' })
  update(
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<Role> {
    return this.rolesService.update(roleId, dto, user, request);
  }

  @Delete(':roleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CheckPermission('rbac', 'delete')
  @ApiOperation({ summary: 'Delete a role' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiNotFoundResponse({ description: 'Role not found' })
  delete(
    @Param('roleId') roleId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.rolesService.delete(roleId, user, request);
  }
}
