import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class UserResponseDto {
  @Expose()
  id: string;

  @Expose()
  code: string;

  @Expose()
  name: string;

  @Expose()
  email: string;

  @Expose()
  profileType: string;

  @Expose()
  phone?: string | null;

  @Expose()
  avatar?: string | null;

  @Expose()
  deviceId?: string | null;

  @Expose()
  fcmToken?: string | null;

  @Expose()
  ip?: string | null;

  @Expose()
  appVersion?: string | null;

  @Expose()
  isEmailVerified: boolean;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;

  /** Role code (e.g. SUPER_ADMIN). Used for client-side permission bypass. */
  @Expose()
  roleCode?: string;

  /** Effective permission codes from the assigned role (see PERMISSIONS.md). */
  @Expose()
  permissions?: string[];
}
