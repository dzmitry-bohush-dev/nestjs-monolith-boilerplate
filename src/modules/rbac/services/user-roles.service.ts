import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import type { FastifyRequest } from 'fastify';
import { UserRole } from '../entities/user-role.entity';
import { Role } from '../entities/role.entity';
import { AssignRoleDto } from '../dtos/assign-role.dto';
import { RbacCacheService } from './rbac-cache.service';
import { AuditLogService } from '@/core/audit-log/audit-log.service';
import { UsersService } from '@/modules/users/services/users.service';
import type { AuthenticatedUser } from '@/modules/auth/types/jwt-payload.type';

@Injectable()
export class UserRolesService {
  constructor(
    @InjectRepository(UserRole)
    private userRoleRepository: Repository<UserRole>,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    private usersService: UsersService,
    private rbacCacheService: RbacCacheService,
    private auditLogService: AuditLogService,
  ) {}

  async assignRole(
    targetUserId: string,
    dto: AssignRoleDto,
    actor: AuthenticatedUser,
    request?: FastifyRequest,
  ): Promise<UserRole> {
    const userRole = await this.persistAssignRole(
      targetUserId,
      dto,
      actor,
      request,
    );
    await this.rbacCacheService.reload();
    return userRole;
  }

  @Transactional()
  private async persistAssignRole(
    targetUserId: string,
    dto: AssignRoleDto,
    actor: AuthenticatedUser,
    request?: FastifyRequest,
  ): Promise<UserRole> {
    const user = await this.usersService.findById(targetUserId);
    if (!user) {
      throw new NotFoundException(`User with id "${targetUserId}" not found`);
    }

    const role = await this.roleRepository.findOne({
      where: { id: dto.roleId },
    });
    if (!role) {
      throw new NotFoundException(`Role with id "${dto.roleId}" not found`);
    }

    const existing = await this.userRoleRepository.findOne({
      where: { userId: targetUserId, roleId: dto.roleId },
    });
    if (existing) {
      throw new ConflictException(`User already has role "${role.name}"`);
    }

    const userRole = this.userRoleRepository.create({
      userId: targetUserId,
      roleId: dto.roleId,
    });
    const saved = await this.userRoleRepository.save(userRole);

    await this.auditLogService.record({
      eventType: 'RBAC_USER_ROLE_ASSIGNED',
      userId: actor.userId,
      request,
      metadata: {
        userRoleId: saved.id,
        targetUserId,
        roleId: dto.roleId,
      },
    });

    return saved;
  }

  async revokeRole(
    targetUserId: string,
    roleId: string,
    actor: AuthenticatedUser,
    request?: FastifyRequest,
  ): Promise<void> {
    await this.persistRevokeRole(targetUserId, roleId, actor, request);
    await this.rbacCacheService.reload();
  }

  @Transactional()
  private async persistRevokeRole(
    targetUserId: string,
    roleId: string,
    actor: AuthenticatedUser,
    request?: FastifyRequest,
  ): Promise<void> {
    const userRole = await this.userRoleRepository.findOne({
      where: { userId: targetUserId, roleId },
    });

    if (!userRole) {
      throw new NotFoundException(
        `User does not have role with id "${roleId}"`,
      );
    }

    await this.userRoleRepository.remove(userRole);

    await this.auditLogService.record({
      eventType: 'RBAC_USER_ROLE_REVOKED',
      userId: actor.userId,
      request,
      metadata: {
        userRoleId: userRole.id,
        targetUserId,
        roleId,
      },
    });
  }

  async findRolesForUser(userId: string): Promise<Role[]> {
    const userRoles = await this.userRoleRepository.find({
      where: { userId },
      relations: ['role'],
    });

    return userRoles.map((ur) => ur.role!);
  }
}
