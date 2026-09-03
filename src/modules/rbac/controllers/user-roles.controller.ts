import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { CheckPermission } from '@/modules/rbac/decorators/check-permission.decorator';
import { AssignRoleDto } from '@/modules/rbac/dtos/assign-role.dto';
import { Role } from '@/modules/rbac/entities/role.entity';
import { UserRole } from '@/modules/rbac/entities/user-role.entity';
import { PermissionGuard } from '@/modules/rbac/guards/permission.guard';
import { UserRolesService } from '@/modules/rbac/services/user-roles.service';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';

@ApiTags('rbac/user-roles')
@ApiBearerAuth()
@Controller('admin/rbac/users/:userId/roles')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
export class UserRolesController {
  constructor(private readonly userRolesService: UserRolesService) {}

  @Get()
  @CheckPermission('rbac', 'read')
  @ApiOperation({ summary: "List a user's roles" })
  @ApiResponse({ status: HttpStatus.OK, type: [Role] })
  findRolesForUser(@Param('userId') userId: string): Promise<Role[]> {
    return this.userRolesService.findRolesForUser(userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CheckPermission('rbac', 'create')
  @ApiOperation({ summary: 'Assign a role to a user' })
  @ApiResponse({ status: HttpStatus.CREATED, type: UserRole })
  @ApiNotFoundResponse({ description: 'User or role not found' })
  @ApiConflictResponse({ description: 'User already has this role' })
  assignRole(
    @Param('userId') userId: string,
    @Body() dto: AssignRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<UserRole> {
    return this.userRolesService.assignRole(userId, dto, actor, request);
  }

  @Delete(':roleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CheckPermission('rbac', 'delete')
  @ApiOperation({ summary: 'Revoke a role from a user' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiNotFoundResponse({ description: 'User does not have this role' })
  revokeRole(
    @Param('userId') userId: string,
    @Param('roleId') roleId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.userRolesService.revokeRole(userId, roleId, actor, request);
  }
}
