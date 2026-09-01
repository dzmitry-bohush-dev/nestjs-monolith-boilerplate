import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import type { FastifyRequest } from 'fastify';
import { Role } from '../entities/role.entity';
import { CreateRoleDto } from '../dtos/create-role.dto';
import { UpdateRoleDto } from '../dtos/update-role.dto';
import { RbacCacheService } from './rbac-cache.service';
import { AuditLogService } from '@/core/audit-log/audit-log.service';
import type { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    private rbacCacheService: RbacCacheService,
    private auditLogService: AuditLogService,
  ) {}

  async create(
    dto: CreateRoleDto,
    user: AuthenticatedUser,
    request?: FastifyRequest,
  ): Promise<Role> {
    const role = await this.persistCreate(dto, user, request);
    await this.reloadCache();
    return role;
  }

  @Transactional()
  private async persistCreate(
    dto: CreateRoleDto,
    user: AuthenticatedUser,
    request?: FastifyRequest,
  ): Promise<Role> {
    const existing = await this.roleRepository.findOne({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException(
        `Role with name "${dto.name}" already exists`,
      );
    }

    const role = this.roleRepository.create(dto);
    const saved = await this.roleRepository.save(role);

    await this.auditLogService.record({
      eventType: 'RBAC_ROLE_CREATED',
      userId: user.userId,
      request,
      metadata: { roleId: saved.id, name: saved.name },
    });

    return saved;
  }

  async update(
    roleId: string,
    dto: UpdateRoleDto,
    user: AuthenticatedUser,
    request?: FastifyRequest,
  ): Promise<Role> {
    const role = await this.persistUpdate(roleId, dto, user, request);
    await this.reloadCache();
    return role;
  }

  @Transactional()
  private async persistUpdate(
    roleId: string,
    dto: UpdateRoleDto,
    user: AuthenticatedUser,
    request?: FastifyRequest,
  ): Promise<Role> {
    const role = await this.roleRepository.findOne({ where: { id: roleId } });

    if (!role) {
      throw new NotFoundException(`Role with id "${roleId}" not found`);
    }

    if (dto.name && dto.name !== role.name) {
      const existing = await this.roleRepository.findOne({
        where: { name: dto.name },
      });
      if (existing) {
        throw new ConflictException(
          `Role with name "${dto.name}" already exists`,
        );
      }
    }

    Object.assign(role, dto);
    const saved = await this.roleRepository.save(role);

    await this.auditLogService.record({
      eventType: 'RBAC_ROLE_UPDATED',
      userId: user.userId,
      request,
      metadata: { roleId: saved.id, changes: dto },
    });

    return saved;
  }

  async delete(
    roleId: string,
    user: AuthenticatedUser,
    request?: FastifyRequest,
  ): Promise<void> {
    await this.persistDelete(roleId, user, request);
    await this.reloadCache();
  }

  @Transactional()
  private async persistDelete(
    roleId: string,
    user: AuthenticatedUser,
    request?: FastifyRequest,
  ): Promise<void> {
    const role = await this.roleRepository.findOne({ where: { id: roleId } });

    if (!role) {
      throw new NotFoundException(`Role with id "${roleId}" not found`);
    }

    await this.roleRepository.remove(role);

    await this.auditLogService.record({
      eventType: 'RBAC_ROLE_DELETED',
      userId: user.userId,
      request,
      metadata: { roleId, name: role.name },
    });
  }

  async findAll(): Promise<Role[]> {
    return this.roleRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findById(roleId: string): Promise<Role | null> {
    return this.roleRepository.findOne({ where: { id: roleId } });
  }

  private async reloadCache() {
    try {
      await this.rbacCacheService.reload();
    } catch (err) {
      console.error('Failed to reload RBAC cache after role mutation:', err);
    }
  }
}
