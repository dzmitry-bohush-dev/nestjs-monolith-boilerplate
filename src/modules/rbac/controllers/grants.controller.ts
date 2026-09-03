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
  ApiBadRequestResponse,
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
import { CreateGrantDto } from '@/modules/rbac/dtos/create-grant.dto';
import { UpdateGrantDto } from '@/modules/rbac/dtos/update-grant.dto';
import { Grant } from '@/modules/rbac/entities/grant.entity';
import { PermissionGuard } from '@/modules/rbac/guards/permission.guard';
import { GrantsService } from '@/modules/rbac/services/grants.service';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';

@ApiTags('rbac/grants')
@ApiBearerAuth()
@Controller('admin/rbac/grants')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
export class GrantsController {
  constructor(private readonly grantsService: GrantsService) {}

  @Get()
  @CheckPermission('rbac', 'read')
  @ApiOperation({ summary: 'List all grants' })
  @ApiResponse({ status: HttpStatus.OK, type: [Grant] })
  findAll(): Promise<Grant[]> {
    return this.grantsService.findAll();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CheckPermission('rbac', 'create')
  @ApiOperation({ summary: 'Create a grant' })
  @ApiResponse({ status: HttpStatus.CREATED, type: Grant })
  @ApiNotFoundResponse({ description: 'Role or permission not found' })
  @ApiConflictResponse({
    description: 'Grant already exists for this role and permission',
  })
  @ApiBadRequestResponse({
    description: "Actions are not a subset of the permission's actions",
  })
  create(
    @Body() dto: CreateGrantDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<Grant> {
    return this.grantsService.create(dto, user, request);
  }

  @Put(':grantId')
  @CheckPermission('rbac', 'update')
  @ApiOperation({ summary: 'Update a grant' })
  @ApiResponse({ status: HttpStatus.OK, type: Grant })
  @ApiNotFoundResponse({ description: 'Grant not found' })
  @ApiBadRequestResponse({
    description: "Actions are not a subset of the permission's actions",
  })
  update(
    @Param('grantId') grantId: string,
    @Body() dto: UpdateGrantDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<Grant> {
    return this.grantsService.update(grantId, dto, user, request);
  }

  @Delete(':grantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CheckPermission('rbac', 'delete')
  @ApiOperation({ summary: 'Delete a grant' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiNotFoundResponse({ description: 'Grant not found' })
  delete(
    @Param('grantId') grantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.grantsService.delete(grantId, user, request);
  }
}
