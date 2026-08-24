import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'required_permissions';

export const RequirePermissions = (...permissions: string[]) =>
    SetMetadata(PERMISSION_KEY, permissions);
