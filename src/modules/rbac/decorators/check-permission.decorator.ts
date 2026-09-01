import { SetMetadata } from '@nestjs/common';

export interface PermissionMetadata {
  permission: string;
  action: string;
}

export const CheckPermission = (permission: string, action: string) =>
  SetMetadata('rbac:permission', { permission, action });
