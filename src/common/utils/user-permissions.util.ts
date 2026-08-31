import { User } from '../../database/entities/user.entity';

/** True if user is SUPER_ADMIN or role includes the permission code. */
export function userHasPermission(
  user: User | null | undefined,
  code: string,
): boolean {
  if (!user?.role) return false;
  if (user.role.code === 'SUPER_ADMIN') return true;
  return (user.role.permissions ?? []).some((p) => p.code === code);
}
