import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import type { FastifyRequest } from 'fastify';
import { Grant } from '../entities/grant.entity';
import { Role } from '../entities/role.entity';
import { Permission } from '../entities/permission.entity';
import { CreateGrantDto } from '../dtos/create-grant.dto';
import { UpdateGrantDto } from '../dtos/update-grant.dto';
import { RbacCacheService } from './rbac-cache.service';
import { AuditLogService } from '@/core/audit-log/audit-log.service';
import type { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';

@Injectable()
export class GrantsService {
  constructor(
    @InjectRepository(Grant)
    private grantRepository: Repository<Grant>,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private permissionRepository: Repository<Permission>,
    private rbacCacheService: RbacCacheService,
    private auditLogService: AuditLogService,
  ) {}

  async create(
    dto: CreateGrantDto,
    user: AuthenticatedUser,
    request?: FastifyRequest,
  ): Promise<Grant> {
    const grant = await this.persistCreate(dto, user, request);
    await this.reloadCache();
    return grant;
  }

  @Transactional()
  private async persistCreate(
    dto: CreateGrantDto,
    user: AuthenticatedUser,
    request?: FastifyRequest,
  ): Promise<Grant> {
    const role = await this.roleRepository.findOne({
      where: { id: dto.roleId },
    });
    if (!role) {
      throw new NotFoundException(`Role with id "${dto.roleId}" not found`);
    }

    const permission = await this.permissionRepository.findOne({
      where: { id: dto.permissionId },
    });
    if (!permission) {
      throw new NotFoundException(
        `Permission with id "${dto.permissionId}" not found`,
      );
    }

    const existing = await this.grantRepository.findOne({
      where: {
        roleId: dto.roleId,
        permissionId: dto.permissionId,
      },
    });
    if (existing) {
      throw new ConflictException(
        `Grant already exists for role "${role.name}" and permission "${permission.name}"`,
      );
    }

    if (dto.actions && dto.actions.length > 0) {
      const invalidActions = dto.actions.filter(
        (action) => !permission.actions.includes(action),
      );
      if (invalidActions.length > 0) {
        throw new BadRequestException(
          `Invalid actions for permission "${permission.name}": ${invalidActions.join(', ')}. Valid actions are: ${permission.actions.join(', ')}`,
        );
      }
    }

    const grant = this.grantRepository.create(dto);
    const saved = await this.grantRepository.save(grant);

    await this.auditLogService.record({
      eventType: 'RBAC_GRANT_CREATED',
      userId: user.userId,
      request,
      metadata: {
        grantId: saved.id,
        roleId: saved.roleId,
        permissionId: saved.permissionId,
        actions: saved.actions,
      },
    });

    return saved;
  }

  async update(
    grantId: string,
    dto: UpdateGrantDto,
    user: AuthenticatedUser,
    request?: FastifyRequest,
  ): Promise<Grant> {
    const grant = await this.persistUpdate(grantId, dto, user, request);
    await this.reloadCache();
    return grant;
  }

  @Transactional()
  private async persistUpdate(
    grantId: string,
    dto: UpdateGrantDto,
    user: AuthenticatedUser,
    request?: FastifyRequest,
  ): Promise<Grant> {
    const grant = await this.grantRepository.findOne({
      where: { id: grantId },
      relations: ['permission'],
    });

    if (!grant) {
      throw new NotFoundException(`Grant with id "${grantId}" not found`);
    }

    if (dto.actions && dto.actions.length > 0 && grant.permission) {
      const invalidActions = dto.actions.filter(
        (action) => !grant.permission!.actions.includes(action),
      );
      if (invalidActions.length > 0) {
        throw new BadRequestException(
          `Invalid actions for permission "${grant.permission.name}": ${invalidActions.join(', ')}. Valid actions are: ${grant.permission.actions.join(', ')}`,
        );
      }
    }

    Object.assign(grant, dto);
    const saved = await this.grantRepository.save(grant);

    await this.auditLogService.record({
      eventType: 'RBAC_GRANT_UPDATED',
      userId: user.userId,
      request,
      metadata: {
        grantId: saved.id,
        changes: dto,
      },
    });

    return saved;
  }

  async delete(
    grantId: string,
    user: AuthenticatedUser,
    request?: FastifyRequest,
  ): Promise<void> {
    await this.persistDelete(grantId, user, request);
    await this.reloadCache();
  }

  @Transactional()
  private async persistDelete(
    grantId: string,
    user: AuthenticatedUser,
    request?: FastifyRequest,
  ): Promise<void> {
    const grant = await this.grantRepository.findOne({
      where: { id: grantId },
    });

    if (!grant) {
      throw new NotFoundException(`Grant with id "${grantId}" not found`);
    }

    await this.grantRepository.remove(grant);

    await this.auditLogService.record({
      eventType: 'RBAC_GRANT_DELETED',
      userId: user.userId,
      request,
      metadata: {
        grantId,
        roleId: grant.roleId,
        permissionId: grant.permissionId,
      },
    });
  }

  async findAll(): Promise<Grant[]> {
    return this.grantRepository.find({
      relations: ['role', 'permission'],
      order: { createdAt: 'DESC' },
    });
  }

  async findById(grantId: string): Promise<Grant | null> {
    return this.grantRepository.findOne({
      where: { id: grantId },
      relations: ['role', 'permission'],
    });
  }

  private async reloadCache() {
    try {
      await this.rbacCacheService.reload();
    } catch (err) {
      console.error('Failed to reload RBAC cache after grant mutation:', err);
    }
  }
}
