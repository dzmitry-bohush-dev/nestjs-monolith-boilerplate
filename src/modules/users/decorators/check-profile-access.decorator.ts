import { SetMetadata } from '@nestjs/common';

export interface ProfileAccessMetadata {
  permission: string;
  action: string;
}

export const CheckProfileAccess = (permission: string, action: string) =>
  SetMetadata('profile:access', { permission, action });
