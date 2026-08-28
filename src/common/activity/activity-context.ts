import { Request } from 'express';
import {
  ActivityActorType,
  ActivityUserType,
} from '../../database/entities/activity.entity';
import { ProfileType, User } from '../../database/entities/user.entity';

/** Optional actor context passed from controllers into services for activity logging. */
export type ActivityActorContext = {
  actor?: User | null;
  ip?: string | null;
  userAgent?: string | null;
};

export function buildActivityContext(
  user: User,
  req?: Request,
): ActivityActorContext {
  const forwarded = req?.headers?.['x-forwarded-for'];
  const forwardedIp =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim()
      : Array.isArray(forwarded)
        ? forwarded[0]
        : undefined;

  return {
    actor: user,
    ip: forwardedIp || req?.ip || user.ip || null,
    userAgent:
      typeof req?.headers?.['user-agent'] === 'string'
        ? req.headers['user-agent']
        : null,
  };
}

export function resolveActivityUserType(
  user?: User | null,
): ActivityUserType | null {
  if (!user) return null;
  if (user.role?.code === 'SUPER_ADMIN') return ActivityUserType.ADMIN;
  switch (user.profileType) {
    case ProfileType.DRIVER:
      return ActivityUserType.DRIVER;
    case ProfileType.BROKER:
      return ActivityUserType.BROKER;
    case ProfileType.COMPANY_USER:
      return ActivityUserType.FACTORY;
    case ProfileType.USER:
    default:
      return ActivityUserType.ADMIN;
  }
}

export function actorFieldsFromContext(ctx?: ActivityActorContext): {
  actorType: ActivityActorType;
  adminId: string | null;
  userId: string | null;
  actorName: string | null;
  userType: ActivityUserType | null;
  ip: string | null;
  userAgent: string | null;
} {
  const user = ctx?.actor;
  if (!user) {
    return {
      actorType: ActivityActorType.SYSTEM,
      adminId: null,
      userId: null,
      actorName: 'System',
      userType: null,
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
    };
  }

  return {
    actorType: ActivityActorType.ADMIN,
    adminId: user.id,
    userId: user.id,
    actorName: user.name ?? null,
    userType: resolveActivityUserType(user),
    ip: ctx?.ip ?? null,
    userAgent: ctx?.userAgent ?? null,
  };
}
