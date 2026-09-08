import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditLogModule } from '@/core/audit-log/audit-log.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { GrantsController } from '@/modules/rbac/controllers/grants.controller';
import { PermissionsController } from '@/modules/rbac/controllers/permissions.controller';
import { RolesController } from '@/modules/rbac/controllers/roles.controller';
import { UserRolesController } from '@/modules/rbac/controllers/user-roles.controller';
import { Grant } from '@/modules/rbac/entities/grant.entity';
import { Permission } from '@/modules/rbac/entities/permission.entity';
import { Role } from '@/modules/rbac/entities/role.entity';
import { UserRole } from '@/modules/rbac/entities/user-role.entity';
import { PermissionGuard } from '@/modules/rbac/guards/permission.guard';
import { GrantsService } from '@/modules/rbac/services/grants.service';
import { PermissionsService } from '@/modules/rbac/services/permissions.service';
import { RbacCacheService } from '@/modules/rbac/services/rbac-cache.service';
import { RolesService } from '@/modules/rbac/services/roles.service';
import { UserRolesService } from '@/modules/rbac/services/user-roles.service';
import { UsersModule } from '@/modules/users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Role, Permission, Grant, UserRole]),
    AuditLogModule,
    forwardRef(() => AuthModule),
    forwardRef(() => UsersModule),
  ],
  controllers: [
    RolesController,
    PermissionsController,
    GrantsController,
    UserRolesController,
  ],
  providers: [
    RolesService,
    PermissionsService,
    GrantsService,
    UserRolesService,
    RbacCacheService,
    PermissionGuard,
  ],
  exports: [RbacCacheService, PermissionGuard],
})
export class RbacModule {}
