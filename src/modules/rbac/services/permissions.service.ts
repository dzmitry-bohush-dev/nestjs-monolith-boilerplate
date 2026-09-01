import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import type { FastifyRequest } from 'fastify';
import { Permission } from '../entities/permission.entity';
import { CreatePermissionDto } from '../dtos/create-permission.dto';
import { UpdatePermissionDto } from '../dtos/update-permission.dto';
import { RbacCacheService } from './rbac-cache.service';
import { AuditLogService } from '@/core/audit-log/audit-log.service';
import type { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private permissionRepository: Repository<Permission>,
    private rbacCacheService: RbacCacheService,
    private auditLogService: AuditLogService,
  ) {}

  async create(
    dto: CreatePermissionDto,
    user: AuthenticatedUser,
    request?: FastifyRequest,
  ): Promise<Permission> {
    const permission = await this.persistCreate(dto, user, request);
    await this.reloadCache();
    return permission;
  }

  @Transactional()
  private async persistCreate(
    dto: CreatePermissionDto,
    user: AuthenticatedUser,
    request?: FastifyRequest,
  ): Promise<Permission> {
    const existing = await this.permissionRepository.findOne({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException(
        `Permission with name "${dto.name}" already exists`,
      );
    }

    const permission = this.permissionRepository.create(dto);
    const saved = await this.permissionRepository.save(permission);

    await this.auditLogService.record({
      eventType: 'RBAC_PERMISSION_CREATED',
      userId: user.userId,
      request,
      metadata: {
        permissionId: saved.id,
        name: saved.name,
        actions: saved.actions,
      },
    });

    return saved;
  }

  async update(
    permissionId: string,
    dto: UpdatePermissionDto,
    user: AuthenticatedUser,
    request?: FastifyRequest,
  ): Promise<Permission> {
    const permission = await this.persistUpdate(
      permissionId,
      dto,
      user,
      request,
    );
    await this.reloadCache();
    return permission;
  }

  @Transactional()
  private async persistUpdate(
    permissionId: string,
    dto: UpdatePermissionDto,
    user: AuthenticatedUser,
    request?: FastifyRequest,
  ): Promise<Permission> {
    const permission = await this.permissionRepository.findOne({
      where: { id: permissionId },
    });

    if (!permission) {
      throw new NotFoundException(
        `Permission with id "${permissionId}" not found`,
      );
    }

    if (dto.name && dto.name !== permission.name) {
      const existing = await this.permissionRepository.findOne({
        where: { name: dto.name },
      });
      if (existing) {
        throw new ConflictException(
          `Permission with name "${dto.name}" already exists`,
        );
      }
    }

    Object.assign(permission, dto);
    const saved = await this.permissionRepository.save(permission);

    await this.auditLogService.record({
      eventType: 'RBAC_PERMISSION_UPDATED',
      userId: user.userId,
      request,
      metadata: { permissionId: saved.id, changes: dto },
    });

    return saved;
  }

  async delete(
    permissionId: string,
    user: AuthenticatedUser,
    request?: FastifyRequest,
  ): Promise<void> {
    await this.persistDelete(permissionId, user, request);
    await this.reloadCache();
  }

  @Transactional()
  private async persistDelete(
    permissionId: string,
    user: AuthenticatedUser,
    request?: FastifyRequest,
  ): Promise<void> {
    const permission = await this.permissionRepository.findOne({
      where: { id: permissionId },
    });

    if (!permission) {
      throw new NotFoundException(
        `Permission with id "${permissionId}" not found`,
      );
    }

    await this.permissionRepository.remove(permission);

    await this.auditLogService.record({
      eventType: 'RBAC_PERMISSION_DELETED',
      userId: user.userId,
      request,
      metadata: { permissionId, name: permission.name },
    });
  }

  async findAll(): Promise<Permission[]> {
    return this.permissionRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findById(permissionId: string): Promise<Permission | null> {
    return this.permissionRepository.findOne({ where: { id: permissionId } });
  }

  private async reloadCache() {
    try {
      await this.rbacCacheService.reload();
    } catch (err) {
      console.error(
        'Failed to reload RBAC cache after permission mutation:',
        err,
      );
    }
  }
}
