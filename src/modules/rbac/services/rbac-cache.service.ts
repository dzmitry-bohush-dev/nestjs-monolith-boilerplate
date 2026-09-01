import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Grant } from '../entities/grant.entity';
import { UserRole } from '../entities/user-role.entity';
import { AuditLogService } from '@/core/audit-log/audit-log.service';

type ActionSet = 'ALL' | Set<string>;

@Injectable()
export class RbacCacheService implements OnModuleInit {
  private grantsByRoleId: Map<string, Map<string, ActionSet>> = new Map();
  private rolesByUserId: Map<string, Set<string>> = new Map();

  constructor(
    @InjectRepository(Grant)
    private grantRepository: Repository<Grant>,
    @InjectRepository(UserRole)
    private userRoleRepository: Repository<UserRole>,
    private auditLogService: AuditLogService,
  ) {}

  async onModuleInit() {
    await this.reload();
  }

  async reload() {
    try {
      const grants = await this.grantRepository.find({
        relations: ['permission'],
      });
      const userRoles = await this.userRoleRepository.find();

      const newGrantsByRoleId = new Map<string, Map<string, ActionSet>>();
      const newRolesByUserId = new Map<string, Set<string>>();

      for (const grant of grants) {
        const permissionName = grant.permission?.name;
        const permissionActions = grant.permission?.actions || [];

        if (!permissionName) {
          continue;
        }

        if (!newGrantsByRoleId.has(grant.roleId)) {
          newGrantsByRoleId.set(grant.roleId, new Map());
        }

        const roleGrants = newGrantsByRoleId.get(grant.roleId)!;

        if (!grant.actions || grant.actions.length === 0) {
          roleGrants.set(permissionName, 'ALL');
        } else {
          const validActions = new Set(
            grant.actions.filter((action) =>
              permissionActions.includes(action),
            ),
          );
          roleGrants.set(permissionName, validActions);
        }
      }

      for (const userRole of userRoles) {
        if (!newRolesByUserId.has(userRole.userId)) {
          newRolesByUserId.set(userRole.userId, new Set());
        }
        newRolesByUserId.get(userRole.userId)!.add(userRole.roleId);
      }

      this.grantsByRoleId = newGrantsByRoleId;
      this.rolesByUserId = newRolesByUserId;

      await this.auditLogService.record({
        eventType: 'RBAC_CACHE_RELOADED',
        userId: undefined,
        metadata: {
          grantCount: grants.length,
          userRoleCount: userRoles.length,
        },
      });
    } catch (err) {
      // Log error but don't propagate during mutation-triggered reloads
      console.error('RBAC cache reload failed:', err);
      throw err;
    }
  }

  hasPermission(userId: string, permission: string, action: string): boolean {
    const userRoles = this.rolesByUserId.get(userId);
    if (!userRoles || userRoles.size === 0) {
      return false;
    }

    for (const roleId of userRoles) {
      const roleGrants = this.grantsByRoleId.get(roleId);
      if (!roleGrants) {
        continue;
      }

      const actionSet = roleGrants.get(permission);
      if (!actionSet) {
        continue;
      }

      if (actionSet === 'ALL' || actionSet.has(action)) {
        return true;
      }
    }

    return false;
  }
}
