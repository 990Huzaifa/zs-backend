import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
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

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
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
