import {
    CanActivate,
    ExecutionContext,
    Injectable,
    ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const requiredPermissions =
            this.reflector.getAllAndOverride<string[]>(PERMISSION_KEY, [
                context.getHandler(),
                context.getClass(),
            ]);

        // No permission required
        if (!requiredPermissions || requiredPermissions.length === 0) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user) {
            throw new ForbiddenException('User not found in request');
        }

        if (!user.role) {
            throw new ForbiddenException('User role not assigned');
        }

        if (user.role.code === 'SUPER_ADMIN') {
            return true;
        }

        if (!user.role.permissions || user.role.permissions.length === 0) {
            throw new ForbiddenException('Role has no permissions assigned');
        }

        // Extract permission codes
        const userPermissionCodes = user.role.permissions.map(
            (permission: any) => permission.code,
        );

        const hasPermission = requiredPermissions.some((perm) =>
            userPermissionCodes.includes(perm),
        );

        if (!hasPermission) {
            throw new ForbiddenException(
                `Missing required permission: ${requiredPermissions.join(', ')}`,
            );
        }

        return true;
    }
}
