import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import {
  CreateAdminUserDto,
  UpdateAdminUserDto,
  UserListQueryDto,
} from '../auth/dto/admin-user.dto';
import { ProfileType, User } from '../database/entities/user.entity';
import { Role } from '../database/entities/role.entity';

export type CreateUserData = {
  name: string;
  email: string;
  password: string;
  phone?: string;
  avatar?: string;
  deviceId?: string;
  fcmToken?: string;
  ip?: string;
  appVersion?: string;
  profileType: ProfileType;
  role: Role;
};

export type CreateSocialUserData = {
  name: string;
  email: string;
  phone?: string;
  avatar?: string | null;
  deviceId?: string;
  fcmToken?: string;
  ip?: string;
  appVersion?: string;
  profileType: ProfileType;
  role: Role;
};

type SafeUser = Omit<User, 'password'>;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
  ) {}

  async create(data: CreateUserData): Promise<User> {
    const user = await this.usersRepository.save(
      this.usersRepository.create({
        name: data.name,
        email: data.email,
        password: data.password,
        phone: data.phone,
        avatar: data.avatar,
        deviceId: data.deviceId,
        fcmToken: data.fcmToken,
        ip: data.ip,
        appVersion: data.appVersion,
        profileType: data.profileType,
        role: data.role,
        roleId: data.role.id,
        code: await this.generateUniqueCode(),
        isEmailVerified: false,
      }),
    );
    return this.findByIdOrFail(user.id);
  }

  async createSocialUser(data: CreateSocialUserData): Promise<User> {
    const user = await this.usersRepository.save(
      this.usersRepository.create({
        name: data.name,
        email: data.email,
        password: null,
        phone: data.phone,
        avatar: data.avatar,
        deviceId: data.deviceId,
        fcmToken: data.fcmToken,
        ip: data.ip,
        appVersion: data.appVersion,
        profileType: data.profileType,
        role: data.role,
        roleId: data.role.id,
        code: await this.generateUniqueCode(),
        isEmailVerified: true,
      }),
    );
    return this.findByIdOrFail(user.id);
  }

  async createAdminUser(dto: CreateAdminUserDto): Promise<SafeUser> {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.usersRepository.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const role = await this.findActiveRoleOrFail(dto.roleId);
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.usersRepository.save(
      this.usersRepository.create({
        name: dto.name.trim(),
        email,
        password: hashedPassword,
        phone: dto.phone ?? null,
        avatar: dto.avatar ?? null,
        profileType: dto.profileType ?? ProfileType.USER,
        role,
        roleId: role.id,
        code: await this.generateUniqueCode(),
        isEmailVerified: true,
      }),
    );

    return this.toSafeUser(await this.findByIdOrFail(user.id));
  }

  async findAllAdmin(query: UserListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<User> = {};
    if (query.roleId) {
      where.roleId = query.roleId;
    }
    if (query.profileType) {
      where.profileType = query.profileType;
    }
    if (query.isEmailVerified !== undefined) {
      where.isEmailVerified = query.isEmailVerified;
    }

    const search = query.search?.trim();
    const whereClause: FindOptionsWhere<User>[] | FindOptionsWhere<User> =
      search
        ? [
            { ...where, name: ILike(`%${search}%`) },
            { ...where, email: ILike(`%${search}%`) },
            { ...where, phone: ILike(`%${search}%`) },
            { ...where, code: ILike(`%${search}%`) },
          ]
        : where;

    const [rows, total] = await this.usersRepository.findAndCount({
      where: whereClause,
      relations: { role: { permissions: true } },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      data: rows.map((user) => this.toSafeUser(user)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOneAdmin(id: string): Promise<SafeUser> {
    return this.toSafeUser(await this.findByIdOrFail(id));
  }

  async updateAdminUser(id: string, dto: UpdateAdminUserDto): Promise<SafeUser> {
    const user = await this.findByIdOrFail(id);

    if (dto.email !== undefined) {
      const email = dto.email.toLowerCase().trim();
      if (email !== user.email) {
        const existing = await this.usersRepository.findOne({ where: { email } });
        if (existing && existing.id !== id) {
          throw new ConflictException('Email already registered');
        }
      }
      user.email = email;
    }

    if (dto.roleId !== undefined) {
      const role = await this.findActiveRoleOrFail(dto.roleId);
      user.role = role;
      user.roleId = role.id;
    }

    if (dto.name !== undefined) user.name = dto.name.trim();
    if (dto.profileType !== undefined) user.profileType = dto.profileType;
    if (dto.phone !== undefined) user.phone = dto.phone;
    if (dto.avatar !== undefined) user.avatar = dto.avatar;

    if (dto.password !== undefined) {
      user.password = await bcrypt.hash(dto.password, 10);
    }

    await this.usersRepository.save(user);
    return this.toSafeUser(await this.findByIdOrFail(id));
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email },
      relations: { role: { permissions: true } },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { id },
      relations: { role: { permissions: true } },
    });
  }

  async findByIdOrFail(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await this.usersRepository.update(userId, { password: hashedPassword });
  }

  async markEmailVerified(userId: string): Promise<User> {
    await this.usersRepository.update(userId, { isEmailVerified: true });
    return this.findByIdOrFail(userId);
  }

  async touchLastLogin(userId: string): Promise<void> {
    await this.usersRepository.update(userId, { lastLoginAt: new Date() });
  }

  async updateProfile(
    userId: string,
    data: Partial<
      Pick<
        User,
        'name' | 'phone' | 'avatar' | 'deviceId' | 'fcmToken' | 'appVersion'
      >
    >,
  ): Promise<User> {
    await this.usersRepository.update(userId, data);
    return this.findByIdOrFail(userId);
  }

  private async findActiveRoleOrFail(roleId: string): Promise<Role> {
    const role = await this.roleRepository.findOne({
      where: { id: roleId, isActive: true },
      relations: { permissions: true },
    });
    if (!role) {
      throw new NotFoundException('Role not found or inactive');
    }
    return role;
  }

  private toSafeUser(user: User): SafeUser {
    const { password: _password, ...safe } = user;
    return safe;
  }

  private async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = `USR${randomBytes(4).toString('hex').toUpperCase()}`;
      const existing = await this.usersRepository.findOne({ where: { code } });
      if (!existing) {
        return code;
      }
    }
    return `USR${Date.now().toString(36).toUpperCase()}`;
  }
}
